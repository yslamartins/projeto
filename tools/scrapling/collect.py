"""Driver de scraping com Scrapling (Shopee e TikTok) — subprocesso do Next.js.

Contrato JSONL no stdout (uma linha por evento):
  {"t":"log","level":"info|step|warn|error|success","message":"..."}
  {"t":"result","ok":true,"data":{...}}   ou   {"t":"result","ok":false,"error":"..."}

Instalação (uma vez):
  python -m venv .venv
  .venv\\Scripts\\python -m pip install -r tools\\scrapling\\requirements.txt
  .venv\\Scripts\\scrapling install

Uso manual:
  .venv\\Scripts\\python tools\\scrapling\\collect.py shopee ping
  .venv\\Scripts\\python tools\\scrapling\\collect.py shopee terms
  .venv\\Scripts\\python tools\\scrapling\\collect.py shopee search --term projetor
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote as _urlencode

from shopee_parser import (
    BASE_URL,
    MAX_TERMS_PER_SCAN,
    complete_with_fallback,
    parse_search_html,
    parse_trending_terms,
)

REPO_ROOT = Path(__file__).resolve().parents[2]

PROFILES = {
    "shopee": REPO_ROOT / ".shopee_profile",
    "tiktok": REPO_ROOT / ".tiktok_profile",
}

HOME_URLS = {
    "shopee": "https://shopee.com.br",
    "tiktok": "https://www.tiktok.com",
}


def emit_log(level: str, message: str) -> None:
    print(
        json.dumps({"t": "log", "level": level, "message": message}, ensure_ascii=False),
        flush=True,
    )


def emit_result(ok: bool, data: Any = None, error: str | None = None) -> None:
    if ok:
        payload: dict[str, Any] = {"t": "result", "ok": True, "data": data or {}}
    else:
        payload = {"t": "result", "ok": False, "error": error or "Erro desconhecido no driver."}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def human_delay(min_ms: int = 400, max_ms: int = 1400) -> None:
    time.sleep(random.randint(min_ms, max_ms) / 1000)


def human_scroll(page: Any, distance: int = 1000) -> None:
    """Rolagem com velocidade variável, micro-reversões e pausas de leitura."""
    moved = 0
    while moved < distance:
        step = min(random.randint(60, 150), distance - moved)
        page.mouse.wheel(0, step)
        moved += step
        time.sleep(random.randint(60, 180) / 1000)
        if random.random() < 0.2:
            page.mouse.wheel(0, -random.randint(20, 80))
            time.sleep(random.randint(60, 220) / 1000)
        if random.random() < 0.12:
            time.sleep(random.randint(500, 1400) / 1000)


def reset_cursor(page: Any) -> None:
    size = page.evaluate("() => ({ w: window.innerWidth, h: window.innerHeight })")
    page.mouse.move(
        random.randint(int(size["w"] * 0.2), int(size["w"] * 0.8)),
        random.randint(int(size["h"] * 0.25), int(size["h"] * 0.85)),
    )


def human_mouse_idle(page: Any) -> None:
    """Pequeno 'vaguear' ocioso do cursor, como quem lê a página."""
    try:
        size = page.evaluate("() => ({ w: window.innerWidth, h: window.innerHeight })")
        page.mouse.move(
            random.randint(0, int(size["w"])),
            random.randint(0, int(size["h"])),
        )
    except Exception:  # noqa: BLE001
        pass


# --- Detecção de gates (portada do engine.ts) ---------------------------------

SECURITY_GATE_MESSAGE = (
    'Shopee exibiu verificação de segurança (anti-bot) e bloqueou esta varredura. '
    'Resolva o desafio/slider uma única vez no navegador visível clicando em "Login Shopee", '
    'e rode a varredura novamente (de preferência com "Modo Visível" ativado).'
)
LOGIN_WALL_MESSAGE = (
    'Shopee exigiu o login para pesquisar este termo (alguns termos, como produtos para adultos, '
    'só aparecem para contas autenticadas). Clique em "Login Shopee", faça login/resolva a verificação '
    'uma vez, e rode a varredura novamente.'
)
TEMPORARY_BLOCK_MESSAGE = (
    'Shopee bloqueou temporariamente a varredura ("A verificação falhou / Tente novamente mais tarde"). '
    'Aguarde alguns minutos antes de tentar de novo; tentativas em sequência rápida reforçam o bloqueio.'
)


def shopee_block_kind(url: str, text: str) -> str | None:
    """Retorna 'temp'|'security'|'login' ou None conforme o estado da página."""
    if "/verify/" in url:
        return "security"
    if "/buyer/login" in url:
        return "login"
    head = text[:3000].lower()
    if (
        "tente novamente mais tarde" in head
        or "a verificação falhou" in head
        or "tente novamente em alguns minutos" in head
    ):
        return "temp"
    if (
        "verifique para continuar" in head
        or "quebra-cabeça" in head
        or "captcha" in head
        or "verificação de segurança" in head
    ):
        return "security"
    if (
        "faça login com senha" in head
        or "fazer login" in head
        or "mantenha-se conectado" in head
        or "stay signed in" in head
    ):
        return "login"
    return None


BLOCK_MESSAGES = {
    "security": SECURITY_GATE_MESSAGE,
    "login": LOGIN_WALL_MESSAGE,
    "temp": TEMPORARY_BLOCK_MESSAGE,
}


def tiktok_block_kind(url: str, text: str) -> str | None:
    if "/login" in url:
        return "login"
    head = text[:2000].lower()
    if "log in to tiktok" in head or "faça login" in head or "sign up" in head:
        return "login"
    return None


def detect_block(site: str, url: str, text: str) -> str | None:
    if site == "shopee":
        return shopee_block_kind(url, text)
    return tiktok_block_kind(url, text)


def _to_str(data: Any) -> str:
    """Response.body vem como bytes; normaliza para str para parser/fixture."""
    if isinstance(data, bytes):
        return data.decode("utf-8", errors="replace")
    return str(data) if data is not None else ""


# --- Ações --------------------------------------------------------------------


def open_session(site: str, headful: bool, timeout_ms: int = 80000):
    """Abre uma StealthySession com perfil persistente por site.

    `real_chrome=True` + `google_search=False` são os achados do spike (ticket 01):
    sem eles a Shopee responde `/verify/captcha?scene=crawler_item`.
    """
    from scrapling.fetchers import StealthySession

    return StealthySession(
        headless=not headful,
        user_data_dir=str(PROFILES[site]),
        timeout=timeout_ms,
        network_idle=False,
        locale="pt-BR",
        real_chrome=True,
    )


def action_ping(site: str, headful: bool) -> dict[str, Any]:
    emit_log("step", f"[ping] Abrindo navegador stealth para {site}...")
    url = HOME_URLS[site]

    def humanize(page: Any) -> None:
        # Páginas como o TikTok navegam durante a ação; o erro não pode abortar o fetch.
        try:
            human_delay(800, 1800)
            reset_cursor(page)
            human_delay(600, 1400)
            human_scroll(page, 900)
        except Exception as exc:  # noqa: BLE001
            emit_log("info", f"[ping] Humanização interrompida (navegação): {type(exc).__name__}")

    with open_session(site, headful) as session:
        human_delay(500, 1200)
        emit_log("step", f"[ping] Navegando para {url}...")
        response = session.fetch(
            url,
            timeout=80000,
            wait=3000,
            load_dom=True,
            google_search=False,
            page_action=humanize,
        )

        final_url = response.url or url
        status = getattr(response, "status", None)
        try:
            title = response.css("title").first.text or ""
        except Exception:
            title = ""
        block = detect_block(site, final_url, response.text or "")

        if block:
            emit_log("warn", f"[ping] Gate detectado em {site}: {block}")
        else:
            emit_log("success", f"[ping] {site} acessível (HTTP {status}) — {title[:80]}")

        return {
            "site": site,
            "url": final_url,
            "status": status,
            "title": title,
            "block": block,
            "ok": block is None,
        }


def action_terms(headful: bool) -> dict[str, Any]:
    """Extrai termos de 'Buscas em alta' + fallback (engine linhas 204-285)."""
    emit_log("step", "[terms] Acessando a home da Shopee para capturar a seção 'Buscas em alta'...")

    def humanize(page: Any) -> None:
        try:
            human_delay(1500, 2500)
            reset_cursor(page)
            human_delay(1000, 2000)
            human_scroll(page, 1000)
            human_delay(800, 1600)
            human_mouse_idle(page)
            human_delay(600, 1200)
        except Exception as exc:  # noqa: BLE001
            emit_log("info", f"[terms] Humanização interrompida: {type(exc).__name__}")

    with open_session("shopee", headful) as session:
        emit_log("step", f"[terms] Navegando para {BASE_URL}...")
        response = session.fetch(
            BASE_URL,
            timeout=80000,
            wait=3000,
            load_dom=True,
            google_search=False,
            page_action=humanize,
        )

        block = shopee_block_kind(response.url or "", response.text or "")
        if block:
            emit_log("warn", f"[terms] Gate detectado na home: {block}")
            return {"ok": False, "block": block, "terms": []}

        terms = parse_trending_terms(response.body or "")
        source = "Buscas em alta"
        if terms:
            emit_log(
                "info",
                f"[terms] {len(terms)} termo(s) capturado(s) da página inicial: "
                + ", ".join(f'"{t}"' for t in terms),
            )
        else:
            emit_log("info", "[terms] Nenhum termo capturado da página inicial; usando o fallback fixo.")

        if len(terms) < MAX_TERMS_PER_SCAN:
            terms = complete_with_fallback(terms)
            source = "Buscas em alta + fallback"
            emit_log(
                "info",
                "[terms] Termos selecionados ("
                + source
                + "): "
                + ", ".join(f'"{t}"' for t in terms),
            )

        return {"ok": True, "terms": terms, "count": len(terms), "source": source, "block": None}


def action_search(term: str, headful: bool, save_fixture: bool = False) -> dict[str, Any]:
    """Coleta RawCardData[] da busca ordenada por 'Mais recente' (engine linhas 310-445)."""
    search_url = f"{BASE_URL}/search?keyword={_urlencode(term)}&sortBy=ctime"
    emit_log("step", f'[search] Pesquisando "{term}" ordenado por "Mais recente"...')

    def humanize(page: Any) -> None:
        try:
            human_delay(1200, 2400)
            reset_cursor(page)
            human_delay(900, 2000)
            human_scroll(page, 1700)
            human_delay(400, 900)
            human_mouse_idle(page)
            human_delay(500, 1100)
        except Exception as exc:  # noqa: BLE001
            emit_log("info", f"[search] Humanização interrompida: {type(exc).__name__}")

    def do_fetch(session) -> Any:
        return session.fetch(
            search_url,
            timeout=80000,
            wait=2000,
            load_dom=True,
            google_search=False,
            page_action=humanize,
        )

    with open_session("shopee", headful) as session:
        response = do_fetch(session)

        final_url = response.url or search_url
        block = shopee_block_kind(final_url, response.text or "")

        cards: list[dict[str, str]] = []
        if block is None:
            html = _to_str(response.body) or ""
            cards = parse_search_html(html)

            # DOM sem cards mas sem gate: recarrega uma vez, como o engine (linhas 336-353).
            if not cards:
                emit_log("info", f'[search] Cards de "{term}" não apareceram; recarregando a busca...')
                response = do_fetch(session)
                final_url = response.url or search_url
                block = shopee_block_kind(final_url, response.text or "")
                if block is None:
                    cards = parse_search_html(_to_str(response.body) or "")

        if save_fixture:
            fixture = Path(__file__).resolve().parent / "tests" / "fixtures"
            fixture.mkdir(parents=True, exist_ok=True)
            slug = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-") or "term"
            target = fixture / f"shopee-search-{slug}.html"
            target.write_text(_to_str(response.body) or "", encoding="utf-8")
            emit_log("info", f"[search] Fixture salva em {target}")

        if block:
            emit_log("warn", f"[search] Gate detectado em shopee: {block}")
        else:
            emit_log("success", f'[search] "{term}": {len(cards)} card(s) extraído(s).')

        return {
            "ok": block is None,
            "term": term,
            "url": final_url,
            "block": block,
            "cards": cards,
            "count": len(cards),
        }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Driver de scraping (Shopee/TikTok) via Scrapling")
    parser.add_argument("site", choices=sorted(PROFILES), help="Site alvo")
    parser.add_argument(
        "action",
        choices=["ping", "terms", "search"],
        help="Ação a executar (terms/search são da Shopee)",
    )
    parser.add_argument("--term", help="Termo de busca (obrigatório em `search`)")
    parser.add_argument(
        "--save-fixture",
        action="store_true",
        help="Salva o HTML da busca em tests/fixtures (para testes offline)",
    )
    parser.add_argument("--headful", action="store_true", help="Janela visível (login/diagnóstico)")
    args = parser.parse_args()

    if args.action in ("terms", "search") and args.site != "shopee":
        emit_result(False, error=f"Ação {args.action} é exclusiva do site shopee.")
        return 2

    try:
        if args.action == "ping":
            data = action_ping(args.site, args.headful)
        elif args.action == "terms":
            data = action_terms(args.headful)
        else:
            if not args.term or not args.term.strip():
                emit_result(False, error="`search` requer --term <termo>.")
                return 2
            data = action_search(args.term.strip(), args.headful, save_fixture=args.save_fixture)
    except Exception as exc:  # noqa: BLE001 — contrato exige uma linha `result`
        emit_log("error", f"Driver falhou: {exc}")
        emit_result(False, error=str(exc))
        return 1

    if data.get("ok"):
        emit_result(True, data=data)
        return 0

    # Gate: reporta erro acionável (mesma semântica do engine)
    block = data.get("block")
    message = BLOCK_MESSAGES.get(block or "", f"Driver bloqueado em {args.site}: {block}")
    emit_result(False, error=message)
    return 1


if __name__ == "__main__":
    sys.exit(main())
