# 02: Driver Shopee — "Buscas em alta" + coleta de cards por termo

**What to build:** o driver Python da varredura da Shopee como subprocesso: extrair os termos de "Buscas em alta" (com o mesmo fallback de termos fixos de hoje) e, dado um termo, navegar para a página de busca ordenada por "Mais recente", aguardar os cards, rolar de forma humanizada e devolver o mesmo `RawCardData[]` que o engine Node já consome — tudo emitindo logs JSONL e fechando com a linha de resultado. A detecção de gates `verify`/captcha/bloqueio temporário continua gerando a flag correspondente no resultado.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** resolved

- [x] `collect shopee terms` retorna a lista de termos (Buscas em alta + fallback dos termos fixos de hoje), via JSONL de resultado
- [x] `collect shopee search --term <x>` navega `?keyword=<x>&sortBy=ctime`, espera os cards de resultado e devolve `RawCardData[]` (href, título, preço, texto de vendas, imagem) no mesmo formato do `RawCardData` TS atual
- [x] Extração portada com a mesma union de seletores e os mesmos fallbacks de título/preço/vendas/imagem usados hoje
- [x] Scroll/delay humanizados portados (a partir do comportamento atual de humanização), com pausas entre as ações
- [x] Detecção de gate: URL `/verify/`, marcadores de captcha/verificação e bloqueio temporário → flag no resultado em vez de cards
- [x] Fixture HTML real de uma página de busca salva no repositório e testes do parser Python sobre ela (sem rede no teste automatizado)
- [x] Execução manual contra a Shopee BR real documentada no ticket (termo real, cards devolvidos e gates observados)

## Comments

### Execução manual (Shopee BR real)

- `collect shopee terms` → 20 termos reais da seção "Buscas em alta" da home (ex.: "Decoração Quarto", "Fone de Ouvido Bluetooth", "Bicicleta Elétrica", "Ar Condicionado Samsung Virus Doctor 12000 BTUs"...), exit 0. O fallback fixo não foi acionado (home veio quente com o perfil persistente).
- `collect shopee search --term projetor` e `--term mouse` → 30 `RawCardData` cada, exit 0, sem gate, com preço real (`R$250,80`) e texto de vendas dedicado ("2mil+ vendidos", "42 vendidos", "338 vendidos").

### Variações do DOM atual da Shopee BR (versus o que o engine assumia)

- O badge de desconto (`-37%`) usa a MESMA classe `text-shopee-primary` do preço e vem antes dele — o seletor antigo capturava o desconto. Preço real hoje: `[aria-label="promotion price"]` com spans partidos (`R$` + `250,80`). `parse_price` resolve aria-label de preço → bloco com R$ → fallback de folha.
- Os cards agora têm âncoras irmãs `find_similar_products?catid=&itemid=&shopid=` que O LEGADO aceitaria como produto (tem `shopid`/`itemid` na query) e viraria card-lixo "Product card". `is_product_href` rejeita `find_similar_products`.
- O badge de vendas dedicado hoje é `[class*='shopee-black87']`; o regex sobre o card inteiro fundia o preço adjacente ("250,80" + "2mil+ vendidos" → "250,802mil+ vendidos"). `extract_sales` prioriza o badge.
- A Shopee voltou a exibir contagem de vendas no DOM (cards com "338 vendidos" etc.), então `rawSalesText` costuma vir populado — o ticket 03 (API) segue como fallback/enriquecimento.

### Arquitetura de teste (sem rede)

- `tools/scrapling/shopee_parser.py`: parsers puros (lxml + regex, sem Scrapling fetcher) — cabe offline.
- Fixtures: `tools/scrapling/tests/fixtures/shopee-search-projetor.html` (página real baixada em 2026-09-23).
- `tools/scrapling/tests/test_shopee_parser.py`: 10 testes (`pytest`), incl. formato de URL, rejeição de `find_similar`, desconto nunca vira preço, salesText limpo, fallback de termos, detecção de gates. Rode: `.venv\Scripts\python -m pytest tools\scrapling\tests -q`.
- `tools/scrapling/requirements-dev.txt` (pytest) + `tests/conftest.py` expõe os módulos do driver ao pytest.
- Comando com `--save-fixture` regenera o fixture: `collect shopee search --term X --save-fixture`.

### Notas de portabilidade

- `Response.body` vem em bytes → decode utf-8 com replace antes de parsear/salvar.
- lxml `fromstring` é XML-estrito e quebra com `&` cru da Shopee → usar `lxml.html.fromstring`.
- Comentários/`<!---->` no `iter()` não têm `text_content()` → filtrar `isinstance(el.tag, str)`.
- Navegação + extração: `page_action` faz a humanização (delay → cursor → scroll → mouse idle) e o parse usa a snapshot `Response` pós-ação — mesmo fluxo visual do engine.