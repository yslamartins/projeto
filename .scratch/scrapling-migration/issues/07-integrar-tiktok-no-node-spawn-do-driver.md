# 07: Integrar TikTok no Node — busca de vídeo aciona o driver via spawn

**What to build:** a busca de vídeo do TikTok voltando a funcionar sobre o Scrapling dentro do app: os endpoints de busca e do pipeline 1-clique passam a acionar `collect tiktok search`, repassam os logs JSONL ao SSE e entregam os cards extraídos ao ranqueador de relevância — que permanece intacto e escolhe o vídeo mais relevante para o produto.

**Blocked by:** 06-driver-tiktok-sessao-headful-persistente-e-busca-de-videos

**Status:** ready-for-agent

- [x] A busca de um vídeo para um produto (busca isolada e dentro do pipeline 1-clique) usa o driver Python, repassando progresso via SSE
- [x] Login-wall detectado pelo driver é reportado em PT-BR e encerra a busca com aviso, sem quebrar o pipeline
- [x] O ranqueador de relevância recebe os cards extraídos e mantém o comportamento atual de "primeiro relevante, não primeiro resultado"
- [x] Falha do driver resulta em `videoStatus="failed"` com mensagem clara, como hoje
- [x] Testes com subprocesso mockado (fixtures JSONL) para: busca ok, login-wall, termo sem resultados, driver que falha
- [ ] Demostração manual registrada no ticket: pipeline 1-clique concluído com o backend Scrapling (busca → download via TikDrop)

Nota (implementação concluída, testes verdes):
- `src/lib/scanner/spawn-driver.ts` (novo, +test): ponte `spawn collect` → JSONL/SSE.
- `searchTikTokVideo`/`openTikTokSession` em `tiktok-search.ts` passam a usar `runCollect`/`runCollectSession` (login-wall como `ok:false` acionável em PT-BR).
- Rotas `/api/video/search` e `/api/video/pipeline` inalteradas em contrato; falha seta `videoStatus="failed"`.
- `tiktok-search.test.ts` (7 testes) cobre busca ok/ranking, login-wall, sem resultados/sem relevância, driver que falha e concorrência.
- Aguardando: demonstração manual de ponta-a-ponta (busca → download via TikDrop) contra o TikTok real.