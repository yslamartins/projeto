"""Parsers puros (sem rede) da Shopee — portados de src/lib/scanner/engine.ts.

Não dependem de navegador nem do Scrapling fetcher: só lxml + regex entraram
para permitir testes offline sobre fixtures HTML reais.
"""
from __future__ import annotations

import re

import lxml.html

BASE_URL = "https://shopee.com.br"

MAX_PRODUCTS_PER_TERM = 30
MAX_TERMS_PER_SCAN = 20

# Termos em alta reais extraídos da seção "Buscas em alta" da Shopee (fallback do engine).
REAL_SHOPEE_TRENDING_TERMS = [
    "Projetor",
    "Mouse Sem Fio",
    "Capa de Chuva Moto",
    "Rasteirinha",
    "Lembrancinha Professores",
    "Biquíni",
    "Kit Calcinha Algodao",
    "Bebê Reborn",
    "PC Gamer",
    "Playstation 5",
    "Panela Mexedeira de Massa Salgado",
    "Pião Fever Profissional",
    "Óculos de Sol Oakley Bluetooth",
    "Lego",
    "Sofá",
    "Vibrador",
    "Pele de Bumbo",
    "Bloqueador de Sinal Bluetooth",
]

# Mesma union de seletores da grade de cards do engine.
CARD_SELECTOR = (
    'a[data-sqe="link"], a[href*="-i."], a[href*="product/"], '
    'a[href*="shopid="], .shopee-search-item-result__item a'
)

SHOPEE_PRODUCT_RE = re.compile(r"(-i\.\d+\.\d+)|(/product/\d+/\d+)")
SHOPID_IN_URL = re.compile(r"[?&]shopid=\d+")
ITEMID_IN_URL = re.compile(r"[?&]itemid=\d+")
SALES_RE = re.compile(r"([\d.,]+\s*(?:mil|k)?\+?\s*vendidos?)", re.IGNORECASE)
PRICE_RE = re.compile(r"R\$\s?[\d.,]+", re.IGNORECASE)
PRICE_LEAF_RE = PRICE_RE


def is_product_href(href: str) -> bool:
    """Aceita os três formatos de link: -i.<shopId>.<itemId>, /product/<s>/<i> e ?shopid=&itemid=.

    Links `find_similar_products?shopid=&itemid=` (recurso atual do card) não são produto.
    """
    if not href:
        return False
    pathname = href.split("?")[0]
    if "find_similar_products" in pathname:
        return False
    if SHOPEE_PRODUCT_RE.search(pathname):
        return True
    return bool(SHOPID_IN_URL.search(href) and ITEMID_IN_URL.search(href))


def _leaf_matches_price(el) -> bool:
    """Folha (sem filhos) cujo texto é um preço R$."""
    if len(list(el)) != 0:
        return False
    return bool(PRICE_LEAF_RE.search(el.text or ""))


def extract_title(card) -> str:
    """Título do card, com os mesmos fallbacks do engine."""
    title = ""
    title_sel = card.cssselect('[data-sqe="name"], .line-clamp-2, .whitespace-normal, [class*="name"]')
    if title_sel:
        title = (title_sel[0].text_content() or "").strip()
    if not title:
        # Sanity: sair se o card em si já é o container com aria-label "Product card: ..."
        aria = card.get("aria-label", "") or ""
        if aria.lower().startswith("product card"):
            title = re.sub(r"^Product card:\s*", "", aria, flags=re.IGNORECASE).strip()
        else:
            for anc in card.iterancestors():
                a = anc.get("aria-label", "") or ""
                if a.lower().startswith("product card"):
                    title = re.sub(r"^Product card:\s*", "", a, flags=re.IGNORECASE).strip()
                    break
    if not title:
        imgs = card.cssselect("img")
        if imgs:
            title = (imgs[0].get("alt") or "").strip()
    return title


def _priced_text(el) -> str:
    """Texto normalizado de um elemento se ele parecer um preço R$ (folha ou bloco)."""
    text = (el.text_content() or "").strip()
    return text.strip() if PRICE_RE.search(text) else ""


def extract_price(card) -> str:
    """Preço do card.

    O badge de desconto também usa `text-shopee-primary` e o preço atual fica em
    `[aria-label="promotion price"]` com spans partidos ("R$" + "250,80"). A ordem é:
    1) elementos com aria-label de preço (sobe no máximo 2 níveis até achar R$);
    2) qualquer elemento [class*="price"] cujo texto tenha R$;
    3) primeira folha span/div com R$ (fallback antigo do engine).
    """
    for aria in card.cssselect("[aria-label*='reais'], [aria-label*='price']"):
        node = aria
        for _ in range(3):
            priced = _priced_text(node)
            if priced:
                return priced
            if node.getparent() is None:
                break
            node = node.getparent()
    for price_el in card.cssselect("[class*='price']"):
        priced = _priced_text(price_el)
        if priced:
            return priced
    for leaf in card.cssselect("span, div"):
        if _leaf_matches_price(leaf):
            return (leaf.text_content() or "").strip()
    return ""


def extract_sales(card) -> str:
    """Texto de vendas dedicado (ex: '2mil+ vendidos'); vazio se o DOM não exibir.

    O regex sobre o card inteiro mistura o preço vizinho ("250,80 2mil+ vendidos" → 
    "250,802mil+ vendidos"), então o caminho preferido é o badge específico
    `[class*='shopee-black87']` que a Shopee BR usa hoje.
    """
    for badge in card.cssselect("[class*='shopee-black87']"):
        match = SALES_RE.search(badge.text_content() or "")
        if match:
            return match.group(1)
    match = SALES_RE.search(card.text_content() or "")
    return match.group(1) if match else ""


def extract_image(card) -> str:
    imgs = card.cssselect("img")
    if not imgs:
        return ""
    src = imgs[0].get("src") or imgs[0].get("data-src") or ""
    return src.strip()


def absolutize(href: str, base: str = BASE_URL) -> str:
    if href.startswith("/"):
        return base + href
    return href


def _as_text(html: str | bytes) -> str:
    if isinstance(html, bytes):
        return html.decode("utf-8", errors="replace")
    return html or ""


def parse_search_html(html: str | bytes, limit: int = MAX_PRODUCTS_PER_TERM) -> list[dict[str, str]]:
    """Extrai RawCardData[] da página de busca como o engine (linhas 362-445)."""
    doc = lxml.html.fromstring(_as_text(html))
    items: list[dict[str, str]] = []
    for card in doc.cssselect(CARD_SELECTOR):
        if len(items) >= limit:
            break
        href = absolutize((card.get("href") or "").strip())
        if not is_product_href(href):
            continue
        title = extract_title(card)
        if not title:
            continue
        items.append(
            {
                "rawHref": href,
                "rawTitle": title,
                "rawPrice": extract_price(card) or "R$ 0,00",
                "rawSalesText": extract_sales(card),
                "rawImageUrl": extract_image(card),
            }
        )
    return items


def _heading_parent(doc) -> lxml.html.HtmlElement | None:
    """Container da seção com o texto exato 'Buscas em alta'/'Top Searches', como no engine."""
    target = None
    for el in doc.iter():
        # Comentários/PIs não são elementos lxml e não têm text_content().
        if not isinstance(el.tag, str):
            continue
        txt = (el.text_content() or "").strip().lower()
        if txt in ("buscas em alta", "top searches"):
            target = el
            break
    if target is None:
        return None

    for anc in target.iterancestors():
        if anc.tag.lower() == "section":
            return anc
    for anc in target.iterancestors():
        if anc.tag.lower() == "div" and "section" in " ".join((anc.get("class") or "").split()):
            return anc
    parent = target.getparent()
    return parent.getparent() if parent is not None else None


def parse_trending_terms(html: str | bytes, limit: int = MAX_TERMS_PER_SCAN) -> list[str]:
    """Termos da seção 'Buscas em alta' (engine linhas 226-260), sem fallback."""
    doc = lxml.html.fromstring(_as_text(html))
    terms: list[str] = []
    parent = _heading_parent(doc)
    if parent is not None:
        for el in parent.xpath(".//a | .//*[contains(@class, 'item')]"):
            text = re.sub(r"buscas em alta", "", el.text_content() or "", flags=re.IGNORECASE).strip()
            if 2 < len(text) < 50 and text not in terms:
                terms.append(text)
    for a in doc.xpath('.//a[contains(@href, "keyword=")]'):
        text = (a.text_content() or "").strip()
        if 2 < len(text) < 50 and text not in terms:
            terms.append(text)
    return terms[:limit]


def complete_with_fallback(terms: list[str], limit: int = MAX_TERMS_PER_SCAN) -> list[str]:
    """Completa a lista com os termos fixos até o limite (engine linhas 274-285)."""
    for fallback in REAL_SHOPEE_TRENDING_TERMS:
        if fallback not in terms:
            terms.append(fallback)
        if len(terms) >= limit:
            break
    return terms[:limit]