# 03: Driver Shopee — enriquecimento de vendas pela API interna + erro 90309999

**What to build:** o fallback/enriquecimento por API interna da Shopee no lado Python. Quando o DOM não renderiza as vendas (ou sai vazio), o driver consulta `/api/v4/search/search_items` com o header `x-api-source: pc` dentro da sessão stealth e junta os dados (especialmente a contagem de vendas) aos `RawCardData`. Quando a API responde com o erro anti-bot `90309999`, o driver sinaliza a flag de gate no resultado em vez de entregar cards falsos.

**Blocked by:** 02-driver-shopee-buscas-em-alta-e-coleta-de-cards-por-termo

**Status:** resolved

- [x] `collect shopee search` enriquece os cards do DOM com a contagem de vendas vinda da API interna quando o DOM não traz vendas (mesma lógica de junção por `<shopid>.<itemId>` de hoje)
- [x] Quando o DOM sai vazio, o driver monta os cards a partir do payload da API interna (mesmo comportamento do fallback atual)
- [x] Erro `90309999` (e afins) da API → flag `gated` no resultado, com log de aviso em PT-BR
- [x] Testes do parser/enriquecimento com mock do payload da API (sem rede)
- [x] Execução manual contra Shopee BR real registrada no ticket

## Comments

### Como foi portado

- `shopee_parser.py` ganhou a camada pura de API: `API_SEARCH_EVALUATE` (mesma chamada `fetch('/api/v4/search/search_items...')` + `x-api-source: pc` do engine, agora executada com `page.evaluate` dentro da `page_action`, na mesma origem/sessão — cookies incluídos), `build_api_sales_map`, `enrich_cards_with_api_sales`, `map_api_item_to_raw_card`, `extract_shopee_product_id` e `is_gated_api_payload`.
- `action_search` agora segue o fluxo exato do engine (linhas 447-497): gate na API + DOM vazio → aborta com gate; gate na API + DOM ok → avisa e usa só o DOM (`gated: true`); API ok + DOM vazio → monta cards da API; API ok + DOM com cards → enriquece vendas.

### Achado real (2026-09-23)

- **A API interna respondeu `90309999` (gate) ao vivo em headless stealth**, mesmo com `real_chrome=True` e o perfil `.shopee_profile` persistente. Simultaneamente o DOM renderizou os 30 cards normalmente com preço e (nas versões atuais) até contagem de vendas no badge.
- Resultado prático: o driver interou no caminho "API gated + DOM ok": warn PT-BR, `"gated": true` no `data`, 30 cards, exit 0 — exatamente a semântica tolerante do engine.
- Consequência de design: o DOM hoje já carrega `rawSalesText` (a Shopee voltou a exibir vendas no card), então o enriquecimento pela API é o caminho de resiliência, não o principal. O fixture JSON da API foi montado a partir dos cards reais (ids/nomes/preços verdadeiros) para cobrir as transformações em teste offline.

### Testes

- Fixtures: `tests/fixtures/shopee_search_items_projetor.json` (6 itens com `item_basic`, incl. `historical_sold` 0 e >0).
- 6 testes novos cobrem: mapa de vendas (ignora 0/ausente), `gated` por `90309999` (string e numérico), enriquecimento que não sobrescreve vendas já no DOM, mapeamento de item→card, extração do `<shopid>.<itemid>` e roundtrip DOM+API.
- 16/16 testes do parser verdes (`pytest tools/scrapling/tests -q`).

### Dica de manutenção

- O fixture JSON pode ser regenerado do HTML da busca atual ou capturado ao vivo (quando a API responder sem gate) com o mesmo formato: `{"term", "gated", "items": [{item_basic: {itemid, shopid, name, price_max, image, historical_sold}}]}`.