"""Testes offline do parser da Shopee — rodam sem rede/navegador sobre fixtures reais."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from shopee_parser import (
    MAX_TERMS_PER_SCAN,
    REAL_SHOPEE_TRENDING_TERMS,
    build_api_sales_map,
    complete_with_fallback,
    enrich_cards_with_api_sales,
    extract_shopee_product_id,
    is_gated_api_payload,
    is_product_href,
    map_api_item_to_raw_card,
    parse_search_html,
    parse_trending_terms,
)
from collect import shopee_block_kind, tiktok_block_kind

FIXTURES = Path(__file__).parent / "fixtures"

SEARCH_HTML = (FIXTURES / "shopee-search-projetor.html").read_text(encoding="utf-8", errors="replace")
API_JSON = json.loads((FIXTURES / "shopee_search_items_projetor.json").read_text(encoding="utf-8"))


def test_parse_search_html_returns_up_to_30_cards():
    cards = parse_search_html(SEARCH_HTML)
    assert len(cards) == 30


def test_parse_search_html_obeys_limit():
    cards = parse_search_html(SEARCH_HTML, limit=5)
    assert len(cards) == 5


def test_cards_look_like_real_products():
    cards = parse_search_html(SEARCH_HTML)
    for card in cards:
        assert is_product_href(card["rawHref"]), card["rawHref"]
        assert card["rawTitle"], card["rawHref"]
        assert re.match(r"^R\$\s?[\d.,]+", card["rawPrice"]), card["rawPrice"]
        assert "find_similar_products" not in card["rawHref"]
        assert card["rawTitle"] != "Product card"


def test_discount_badge_never_becomes_price():
    cards = parse_search_html(SEARCH_HTML)
    assert all(not card["rawPrice"].startswith("-") for card in cards)


def test_sales_text_uses_sales_badge_not_price_merge():
    cards = parse_search_html(SEARCH_HTML)
    seens = [c["rawSalesText"] for c in cards if c["rawSalesText"]]
    assert "2mil+ vendidos" in seens
    assert "42 vendidos" in seens
    assert "43 vendidos" in seens
    assert all(not re.fullmatch(r"[\d,.]+\d{3}mil\+ vendidos", s) for s in seens)


def test_is_product_href_formats():
    assert is_product_href("https://shopee.com.br/X-Y-i.12345.67890")
    assert is_product_href("https://shopee.com.br/x-y-i.12345.67890?extraParams=x")
    assert is_product_href("https://shopee.com.br/product/12345/67890")
    assert is_product_href("https://shopee.com.br/search?shopid=1&itemid=2")
    assert not is_product_href("https://shopee.com.br/find_similar_products?catid=1&itemid=2&shopid=3")
    assert not is_product_href("https://shopee.com.br/")
    assert not is_product_href("")


TRENDING_HTML = """
<div class="homepage-flash-sale">
  <section>
    <div>Buscas em alta</div>
    <a href="/search?keyword=Projetor">Projetor</a>
    <a href="/search?keyword=Mouse">Mouse</a>
  </section>
  <a href="/search?keyword=Drone">Drone</a>
</div>
"""


def test_parse_trending_terms_from_buscas_em_alta():
    terms = parse_trending_terms(TRENDING_HTML)
    assert terms == ["Projetor", "Mouse", "Drone"]


def test_complete_with_fallback_reaches_cap():
    terms = complete_with_fallback(["Projetor"])
    assert 0 < len(terms) <= MAX_TERMS_PER_SCAN
    assert terms[0] == "Projetor"
    assert len(set(terms)) == len(terms)
    assert len(terms) >= 5
    assert REAL_SHOPEE_TRENDING_TERMS[0] in terms


def test_shopee_block_kind_detection():
    assert shopee_block_kind("https://shopee.com.br/verify/captcha?x=1", "") == "security"
    assert shopee_block_kind("https://shopee.com.br/buyer/login?next=/", "") == "login"
    assert shopee_block_kind("https://shopee.com.br/", "tente novamente mais tarde") == "temp"
    assert shopee_block_kind("https://shopee.com.br/", "verifique para continuar") == "security"
    assert shopee_block_kind("https://shopee.com.br/", "faça login com senha") == "login"
    assert shopee_block_kind("https://shopee.com.br/", "produtos novos") is None


def test_tiktok_block_kind_detection():
    assert tiktok_block_kind("https://www.tiktok.com/login?x=1", "") == "login"
    assert tiktok_block_kind("https://www.tiktok.com/", "Log in to TikTok") == "login"
    assert tiktok_block_kind("https://www.tiktok.com/", "vídeos") is None


# --- Enriquecimento / fallback pela API interna ---------------------------------


def test_build_api_sales_map_uses_historical_sold():
    items = API_JSON["items"]
    mapping = build_api_sales_map(items)
    assert len(mapping) >= 3
    assert mapping["1114645438.46900938754"] == 2000
    assert mapping["1114645438.29145287066"] == 42
    for item in items:
        basic = item["item_basic"]
        pid = f"{basic['shopid']}.{basic['itemid']}"
        sold = basic["historical_sold"]
        if sold > 0:
            assert mapping[pid] == sold
        else:
            assert pid not in mapping
    # zero/ausente não entra no mapa
    assert build_api_sales_map([{"item_basic": {"itemid": 1, "shopid": 2, "historical_sold": 0}}]) == {}


def test_is_gated_api_payload():
    assert is_gated_api_payload({"error": "90309999", "data": []}) is True
    assert is_gated_api_payload({"error": 90309999}) is True
    assert is_gated_api_payload({"data": [{"item_basic": {}}]}) is False
    assert is_gated_api_payload(None) is False


def test_enrich_cards_with_api_sales():
    dom_cards = parse_search_html(SEARCH_HTML)
    mapping = build_api_sales_map(API_JSON["items"])
    # remove o texto de vendas do DOM para simular a página antiga sem badge
    stripped = [{**c, "rawSalesText": ""} for c in dom_cards]
    enriched = enrich_cards_with_api_sales(stripped, mapping)
    matched = {c["rawSalesText"] for c in enriched if c["rawSalesText"]}
    assert "2000 vendidos" in matched
    assert "42 vendidos" in matched
    # carta com vendas já preenchida não é sobrescrita
    kept = [c for c in parse_search_html(SEARCH_HTML) if c["rawSalesText"]][:1]
    assert enrich_cards_with_api_sales(kept, mapping)[0]["rawSalesText"] == kept[0]["rawSalesText"]


def test_map_api_item_to_raw_card():
    items = API_JSON["items"]
    first = items[0]["item_basic"]
    card = map_api_item_to_raw_card(items[0])
    assert card is not None
    assert card["rawHref"] == f"https://shopee.com.br/product/{first['shopid']}/{first['itemid']}"
    assert card["rawTitle"] == first["name"]
    assert card["rawPrice"] == f"R$ {first['price_max'] / 100000:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    assert card["rawSalesText"] == f"{first['historical_sold']} vendidos"
    assert card["rawImageUrl"].endswith(first["image"])
    assert map_api_item_to_raw_card({}) is None


def test_extract_shopee_product_id():
    assert extract_shopee_product_id("https://shopee.com.br/X-Y-i.111.222?extra=1") == "111.222"
    assert extract_shopee_product_id("https://shopee.com.br/product/111/222") == "111.222"
    assert extract_shopee_product_id("https://shopee.com.br/a?shopid=111&itemid=222") == "111.222"
    assert extract_shopee_product_id("https://shopee.com.br/") == ""


def test_enrichment_roundtrip_dom_plus_api():
    """Cards do DOM + mapa da API: todo card caseável recebe vendas; ids batem."""
    dom_cards = parse_search_html(SEARCH_HTML)
    mapping = build_api_sales_map(API_JSON["items"])
    stripped = [{**c, "rawSalesText": ""} for c in dom_cards]
    enriched = enrich_cards_with_api_sales(stripped, mapping)
    for card in enriched:
        pid = extract_shopee_product_id(card["rawHref"])
        if pid in mapping:
            assert card["rawSalesText"] == f"{mapping[pid]} vendidos"
            assert card["rawHref"] != ""