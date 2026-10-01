"""Estado da sessao HITL: Chrome puro, perfil persistente e verificacao de login.

O login da Shopee NAO roda dentro do navegador automatizado. O launch do Scrapling
(patchright) aplica ~60 flags stealth (`scrapling/engines/constants.py`), forca
viewport/DSF/is_mobile e mantem CDP conectado -- e foi nesse ambiente que o modal
"logar com numero de telefone" travou em loading infinito. Como o login e 100%
humano (HITL), nao ha nada a automatizar: basta abrir o Chrome de verdade no perfil
persistente e deixar a pessoa resolver.

Este modulo cuida so do essencial:

  * achar o executavel do Chrome (`SHOPEE_CHROME_PATH` ou caminhos de instalacao);
  * montar os argumentos de abertura (perfil persistente, sem flags de automacao);
  * derrubar o Chrome orfao que ficou segurando o `user_data_dir`;
  * verificar, DEPOIS que a janela fecha, se o login gravou o cookie `SPC_ST`.

Sobre a verificacao: o Chrome segura `Default/Network/Cookies` com lock EXCLUSIVO
enquanto roda (CreateFileW com FILE_SHARE_READ|WRITE|DELETE ainda devolve
ERROR_SHARING_VIOLATION). Logo, o cookie so pode ser lido com o navegador fechado --
e nao da para interrogar o navegador sem CDP. Por isso `read_auth_state` devolve
`None` para "indisponivel agora" em vez de mentir com um `False`.
"""
from __future__ import annotations

import datetime as dt
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Any

# Cookie de sessao da Shopee web. Sem ele a conta nao esta autenticada -- um perfil
# "quase logado" so tem os cookies anti-bot (SPC_SI, SPC_SEC_SI, SPC_R_T_ID), que
# nao abrem nem a pagina de pedidos.
SHOPEE_AUTH_COOKIE = "SPC_ST"

SHOPEE_LOGIN_URL = "https://shopee.com.br/login"

# Chrome nao cria "lockfile" no Windows (ele usa um mutex nomeado), entao procurar
# so esse arquivo -- como fazia o driver -- dava sempre "perfil livre". Estes sao os
# artefatos que sobram em disco quando um launch e interrompido no meio.
LOCK_ARTIFACTS = ("lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket")

_CHROME_RELATIVE_PATH = ("Google", "Chrome", "Application", "chrome.exe")

# Ordem de tentativas do executavel. `PROGRAMFILES` primeiro porque e onde o
# instalador oficial coloca; `LOCALAPPDATA` cobre o auto-instalado/portatil.
_CHROME_ENV_ROOTS = ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")

# Epoch do formato de data do Chrome (1601-01-01), usado em `cookies.expires_utc`.
_CHROME_EPOCH = dt.datetime(1601, 1, 1, tzinfo=dt.timezone.utc)


def resolve_chrome_path(env: dict[str, str] | None = None) -> str | None:
    """Caminho do chrome.exe, ou None se nao achar.

    `SHOPEE_CHROME_PATH` tem prioridade absoluta: se aponta para um caminho que nao
    existe, devolvemos None em vez de silenciosamente cair no Chrome do sistema --
    assim o driver consegue dizer "voce configurou um caminho invalido" em vez de
    abrir um navegador diferente do que o usuario pediu.
    """
    source = os.environ if env is None else env

    override = (source.get("SHOPEE_CHROME_PATH") or "").strip()
    if override:
        return override if Path(override).is_file() else None

    for root_var in _CHROME_ENV_ROOTS:
        root = (source.get(root_var) or "").strip()
        if not root:
            continue
        candidate = Path(root).joinpath(*_CHROME_RELATIVE_PATH)
        if candidate.is_file():
            return str(candidate)
    return None


def login_args(profile_dir: Path, url: str) -> list[str]:
    """Argumentos de abertura do Chrome de verdade.

    Sem `--enable-automation`, sem `--disable-blink-features=AutomationControlled`,
    sem `--remote-debugging-port`, sem `--headless`: e o Chrome que a pessoa usa no
    dia a dia, so que apontando pro perfil persistente. Qualquer um desses flags
    volta a contaminar o launch e o login volta a travar.
    """
    return [
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        url,
    ]


def _normalize_dir(value: str | Path) -> str:
    text = str(value).replace("\\", "/").rstrip("/")
    return text.lower()


def _command_line_targets_profile(command_line: str, target: str) -> bool:
    """True se algum `--user-data-dir` do command line aponta pro perfil."""
    if not command_line:
        return False
    marker = "--user-data-dir="
    at = command_line.find(marker)
    while at != -1:
        rest = command_line[at + len(marker):]
        if rest.startswith('"'):
            close = rest.find('"', 1)
            value = rest[1:close] if close != -1 else rest[1:]
        else:
            value = rest.split(" ")[0]
        if value and _normalize_dir(value) == target:
            return True
        at = command_line.find(marker, at + len(marker))
    return False


def chrome_pids_for_profile(profile_dir: Path) -> list[int]:
    """PIDs de chrome.exe cujo `--user-data-dir` aponta pro perfil dado.

    O PowerShell devolve `PID<TAB>CommandLine`. O path costuma vir entre aspas
    quando contem espaco, entao a comparacao normaliza barras e remove aspas em vez
    de fazer `startswith` cru.
    """
    script = (
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
        'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }'
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=20000,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:  # noqa: BLE001 ÔÇö maquina sem PowerShell e um caso legitimo
        return []

    target = _normalize_dir(profile_dir)
    pids: list[int] = []
    for line in proc.stdout.splitlines():
        pid_text, _, command_line = line.partition("\t")
        try:
            pid = int(pid_text.strip())
        except ValueError:
            continue
        if _command_line_targets_profile(command_line, target):
            pids.append(pid)
    return pids


def kill_profile_chrome(profile_dir: Path) -> list[int]:
    """Derruba todo Chrome preso no perfil e limpa artefatos de lock orfaos.

    `taskkill /F /T` falha silenciosamente neste ambiente (saida vazia, processo
    sobrevive) -- ver o diagnostico registrado em `src/lib/whatsapp/sweep.ts:66`.
    So `Stop-Process -Force` derruba de verdade.
    """
    pids = chrome_pids_for_profile(profile_dir)
    for pid in pids:
        try:
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    f"Stop-Process -Id {pid} -Force",
                ],
                capture_output=True,
                timeout=20000,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except Exception:  # noqa: BLE001 ÔÇö um PID que nao morre nao invalida os outros
            continue

    if pids:
        for artifact in LOCK_ARTIFACTS:
            try:
                (profile_dir / artifact).unlink(missing_ok=True)
            except OSError:
                pass  # ainda em uso por um processo que esta morrendo
    return pids


# --- Verificacao de autenticacao (so com o navegador fechado) --------------------


def cookie_db_path(profile_dir: Path) -> Path | None:
    """`Default/Network/Cookies` (Chrome atual) ou `Default/Cookies` (legado)."""
    candidates = (
        profile_dir / "Default" / "Network" / "Cookies",
        profile_dir / "Default" / "Cookies",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def now_utc_us() -> int:
    """Microssegundos desde 1601-01-01, a unidade de `cookies.expires_utc`."""
    return int((dt.datetime.now(dt.timezone.utc) - _CHROME_EPOCH).total_seconds() * 1_000_000)


def is_cookie_live(expires_utc: int, now_utc_us: int) -> bool:
    """False = expirado; 0 e cookie de sessao e conta como vivo.

    Um `SPC_ST` vencido e tao inutil quanto nenhum: a Shopee volta a exigir login.
    """
    if expires_utc == 0:
        return True
    return expires_utc > now_utc_us


def _has_live_cookie(rows: list[tuple[Any, ...]], now_utc_us: int) -> bool:
    """True se alguma linha (host_key, name, expires_utc) for cookie Shopee vivo."""
    for host_key, _name, expires_utc in rows:
        if "shopee" not in (host_key or ""):
            continue
        if is_cookie_live(int(expires_utc or 0), now_utc_us):
            return True
    return False


def read_auth_state(
    profile_dir: Path,
    auth_cookie: str = SHOPEE_AUTH_COOKIE,
    now_utc_us: int | None = None,
) -> bool | None:
    """True autenticado / False sem login / None se nao deu para ler agora.

    `None` e uma resposta importante, nao um fracasso: com o Chrome aberto o
    arquivo de cookies esta travado, e inferir "deslogado" ali seria mentira --
    foi exatamente esse o bug que fazia a UI dizer "Navegador aberto!" sem base.
    """
    db_path = cookie_db_path(profile_dir)
    if db_path is None:
        return False

    try:
        target = Path(tempfile.gettempdir()) / "scrapling-session-state" / db_path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(db_path.read_bytes())
    except OSError:
        return None

    reference_us = globals()["now_utc_us"]() if now_utc_us is None else now_utc_us

    try:
        conn = sqlite3.connect(f"file:{target.as_posix()}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT host_key, name, expires_utc FROM cookies WHERE name = ?",
                (auth_cookie,),
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return None

    return _has_live_cookie(rows, reference_us)
