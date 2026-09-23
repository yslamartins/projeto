# 02: Driver Shopee — "Buscas em alta" + coleta de cards por termo

**What to build:** o driver Python da varredura da Shopee como subprocesso: extrair os termos de "Buscas em alta" (com o mesmo fallback de termos fixos de hoje) e, dado um termo, navegar para a página de busca ordenada por "Mais recente", aguardar os cards, rolar de forma humanizada e devolver o mesmo `RawCardData[]` que o engine Node já consome — tudo emitindo logs JSONL e fechando com a linha de resultado. A detecção de gates `verify`/captcha/bloqueio temporário continua gerando a flag correspondente no resultado.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** ready-for-agent

- [ ] `collect shopee terms` retorna a lista de termos (Buscas em alta + fallback dos termos fixos de hoje), via JSONL de resultado
- [ ] `collect shopee search --term <x>` navega `?keyword=<x>&sortBy=ctime`, espera os cards de resultado e devolve `RawCardData[]` (href, título, preço, texto de vendas, imagem) no mesmo formato do `RawCardData` TS atual
- [ ] Extração portada com a mesma union de seletores e os mesmos fallbacks de título/preço/vendas/imagem usados hoje
- [ ] Scroll/delay humanizados portados (a partir do comportamento atual de humanização), com pausas entre as ações
- [ ] Detecção de gate: URL `/verify/`, marcadores de captcha/verificação e bloqueio temporário → flag no resultado em vez de cards
- [ ] Fixture HTML real de uma página de busca salva no repositório e testes do parser Python sobre ela (sem rede no teste automatizado)
- [ ] Execução manual contra a Shopee BR real documentada no ticket (termo real, cards devolvidos e gates observados)