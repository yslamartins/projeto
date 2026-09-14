# 05: Extração de Produtos Tolerante aos Dois Formatos de URL

**What to build:** O mecanismo de coleta passa a reconhecer cards de produto tanto no formato antigo (`...-i.<shopId>.<itemId>`) quanto no formato atual (`/product/<shopId>/<itemId>` e `?...shopid=<shopId>&itemid=<itemId>`), convertendo ambos em candidatos completos (id, título, preço, vendas, imagem, URL). A varredura continua selecionando só o primeiro produto com >= 5 vendas que ainda não existe no banco.

**Blocked by:** None (can start immediately)

**Status:** resolved

## Comments

- Implementado: `isShopeeProductUrl` em `src/lib/scanner/parser.ts` reconhecendo os três formatos; `extractShopeeProductId`/`normalizeShopeeUrl` com suporte a `?shopid=&itemid=` (canonicalizando para `/product/<shopId>/<itemId>`); guard de `parseProductCard` alinhado ao helper; coletor em `engine.ts` aceita os três formatos. Testes unitários (28/28) e typecheck limpos.

- [x] Coletor da página de busca captura links nos dois formatos sem filtrar por `-i.`
- [x] `parseProductCard` aceita hrefs `/product/<shopId>/<itemId>` e `?...shopid=&itemid=` além de `-i.`
- [x] ID único extraído corretamente (`shopId.itemId`) nos três formatos
- [x] Testes unitários verdes para fixture de cada formato, incluindo vendas >= 5 e dedupe
- [x] Sem mudanças de pipeline/arquitetura; nenhum ajuste E2E/DOM real neste ticket