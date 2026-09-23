"""Testes offline do parser da Shopee — rodam sem rede/navegador sobre fixtures reais."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from shopee_parser import (
    MAX_TERMS_PER_SCAN,
    REAL_SHOPEE_TRENDING_TERMS,
    complete_with_fallback,
    is_product_href,
    parse_search_html,
    parse_trending_terms,
)
from collect import shopee_block_kind, tiktok_block_kind

FIXTURES = Path(__file__).parent / "fixtures"

SEARCH_HTML = (FIXTURES / "shopee-search-projetor.html").read_text(encoding="utf-8", errors="replace")


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