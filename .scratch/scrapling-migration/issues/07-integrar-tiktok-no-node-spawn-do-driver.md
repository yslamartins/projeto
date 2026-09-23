# 07: Integrar TikTok no Node — busca de vídeo aciona o driver via spawn

**What to build:** a busca de vídeo do TikTok voltando a funcionar sobre o Scrapling dentro do app: os endpoints de busca e do pipeline 1-clique passam a acionar `collect tiktok search`, repassam os logs JSONL ao SSE e entregam os cards extraídos ao ranqueador de relevância — que permanece intacto e escolhe o vídeo mais relevante para o produto.

**Blocked by:** 06-driver-tiktok-sessao-headful-persistente-e-busca-de-videos

**Status:** ready-for-agent

- [ ] A busca de um vídeo para um produto (busca isolada e dentro do pipeline 1-clique) usa o driver Python, repassando progresso via SSE
- [ ] Login-wall detectado pelo driver é reportado em PT-BR e encerra a busca com aviso, sem quebrar o pipeline
- [ ] O ranqueador de relevância recebe os cards extraídos e mantém o comportamento atual de "primeiro relevante, não primeiro resultado"
- [ ] Falha do driver resulta em `videoStatus="failed"` com mensagem clara, como hoje
- [ ] Testes com subprocesso mockado (fixtures JSONL) para: busca ok, login-wall, termo sem resultados, driver que falha
- [ ] Demostração manual registrada no ticket: pipeline 1-clique concluído com o backend Scrapling (busca → download via TikDrop)