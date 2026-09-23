# 03: Driver Shopee — enriquecimento de vendas pela API interna + erro 90309999

**What to build:** o fallback/enriquecimento por API interna da Shopee no lado Python. Quando o DOM não renderiza as vendas (ou sai vazio), o driver consulta `/api/v4/search/search_items` com o header `x-api-source: pc` dentro da sessão stealth e junta os dados (especialmente a contagem de vendas) aos `RawCardData`. Quando a API responde com o erro anti-bot `90309999`, o driver sinaliza a flag de gate no resultado em vez de entregar cards falsos.

**Blocked by:** 02-driver-shopee-buscas-em-alta-e-coleta-de-cards-por-termo

**Status:** ready-for-agent

- [ ] `collect shopee search` enriquece os cards do DOM com a contagem de vendas vinda da API interna quando o DOM não traz vendas (mesma lógica de junção por `<shopid>.<itemId>` de hoje)
- [ ] Quando o DOM sai vazio, o driver monta os cards a partir do payload da API interna (mesmo comportamento do fallback atual)
- [ ] Erro `90309999` (e afins) da API → flag `gated` no resultado, com log de aviso em PT-BR
- [ ] Testes do parser/enriquecimento com mock do payload da API (sem rede)
- [ ] Execução manual contra Shopee BR real registrada no ticket