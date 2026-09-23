"""Testes offline do parser de busca do TikTok (ticket 06).

Espelha a lógica de src/lib/scanner/tiktok-search.ts: cards `a[href*="/video/"]`,
dedup por href sem query string e autor extraído de `/(@[\w.]+)/`. O ranqueamento
(rankTikTokVideos) fica no lado Node (ticket 07); aqui só o card bruto é validado.
"""
import pathlib

import pytest

from shopee_parser import parse_tiktok_search_html


@pytest.fixture(scope="module")
def live_fixture_html() -> bytes:
    path = pathlib.Path(__file__).resolve().parent / "fixtures" / "tiktok-search-mouse-bluetooth.html"
    return path.read_bytes()


CARD_HTML = """
<!doctype html>
<html><body>
  <div data-e2e="search-webslides">
    <div data-e2e="search-card-container">
      <div class="div-card">
        <a class="css-1gxi5xj" href="/@parzival_shop/video/7595823211514760469" title=""
           data-e2e="search-card-video-link">
          <div class="video-card-player">
            <div>
              <p>832</p>
              <p>melhor coisa é começar a usar mouse bluetooth ou 2.4G</p>
            </div>
          </div>
        </a>
      </div>
    </div>
    <div data-e2e="search-card-container">
      <div class="div-card">
        <a class="css-1gxi5xj"
           href="https://www.tiktok.com/@clickcompreja1/video/7575745726467017991?lang=pt-BR"
           data-e2e="search-card-video-link">
          <div class="video-card-player">
            <div>
              <p>42</p>
              <span>Mouse Sem Fio Bluetooth com LED RGB</span>
            </div>
          </div>
        </a>
      </div>
    </div>
  </div>
</body></html>
"""


def test_parse_tiktok_search_extracts_cards():
    cards = parse_tiktok_search_html(CARD_HTML)
    assert len(cards) == 2
    hrefs = [c["href"] for c in cards]
    assert "https://www.tiktok.com/@parzival_shop/video/7595823211514760469" in hrefs
    assert "https://www.tiktok.com/@clickcompreja1/video/7575745726467017991" in hrefs


def test_parse_tiktok_search_dedupes_by_href_without_query():
    html = CARD_HTML.replace("7575745726467017991?lang=pt-BR", "7575745726467017991?lang=pt-BR") + """
    <a href="https://www.tiktok.com/@clickcompreja1/video/7575745726467017991?share=1">
      <div><p>outro texto com mais de dois chars</p></div>
    </a>
    """
    cards = parse_tiktok_search_html(html)
    keys = [c["href"] for c in cards]
    assert len(keys) == len(set(keys))
    assert keys.count("https://www.tiktok.com/@clickcompreja1/video/7575745726467017991") == 1


def test_parse_tiktok_search_author_from_key():
    cards = parse_tiktok_search_html(CARD_HTML)
    by_href = {c["href"]: c for c in cards}
    assert by_href["https://www.tiktok.com/@parzival_shop/video/7595823211514760469"]["author"] == "parzival_shop"
    assert by_href["https://www.tiktok.com/@clickcompreja1/video/7575745726467017991"]["author"] == "clickcompreja1"


def test_parse_tiktok_search_caption_skips_numeric_counter():
    html = """
    <div>
      <a href="/@user/video/123456789">
        <div>
          <span class="count">832</span>
          <div><div><div><p>melhor coisa é começar a usar mouse bluetooth</p></div></div></div>
        </div>
      </a>
    </div>
    """
    cards = parse_tiktok_search_html(html)
    assert cards[0]["caption"] == "832 melhor coisa é começar a usar mouse bluetooth"


def test_parse_tiktok_search_caption_may_keep_numeric_prefix():
    """No DOM real o contador fica no MESMO container que a legenda -> prefixo numérico.
    Isso espelha o textContent do engine (ex.: '42✨ Mouse Sem Fio Bluetooth...')."""
    cards = parse_tiktok_search_html(CARD_HTML)
    by_href = {c["href"]: c for c in cards}
    assert (
        by_href["https://www.tiktok.com/@parzival_shop/video/7595823211514760469"]["caption"]
        == "832 melhor coisa é começar a usar mouse bluetooth ou 2.4G"
    )


def test_parse_tiktok_search_caption_truncated_to_200():
    long_caption = "Mouse sem fio bluetooth " * 30
    html = f"""
    <a href="/@user/video/123456789">
      <div><div><p>7</p><p>{long_caption}</p></div></div>
    </a>
    """
    cards = parse_tiktok_search_html(html)
    assert len(cards[0]["caption"]) == 200


def test_parse_tiktok_search_live_fixture(live_fixture_html):
    """Smoke test contra o HTML real capturado da busca TikTok (sem login-wall)."""
    cards = parse_tiktok_search_html(live_fixture_html)
    assert len(cards) >= 10
    for card in cards:
        assert card["href"].startswith("https://www.tiktok.com/@")
        assert card["author"]
        assert card["caption"]