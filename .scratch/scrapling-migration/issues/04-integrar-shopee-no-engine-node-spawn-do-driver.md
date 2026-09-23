# 04: Integrar Shopee no engine Node — `runShopeeScanner` aciona o driver via spawn

**What to build:** "Iniciar Varredura" pronto, ponta-a-ponta, com o motor headless rodando sobre o Scrapling. O engine Node continua orquestrando (extração de termos, iteração sequencial, pausas entre termos, limites de 20/30/10, dedup, elegibilidade, upsert no Prisma, resumo final), mas cada ação de página passa a ser um subprocesso `python collect.py` — os logs JSONL são repassados ao `scannerEvents` (e ao SSE) e o `RawCardData[]` resultante segue pelo pipeline já testado.

**Blocked by:** 03-driver-shopee-enriquecimento-de-vendas-pela-api-interna-e-erro-90309999

**Status:** ready-for-agent

- [ ] O engine aciona o driver Python por termo (e para "Buscas em alta") e para um estado onde o driver falhe/retorne gate, a varredura reporta e continua os demais termos, como hoje
- [ ] Logs JSONL viram eventos `step/info/warn/error/success` no terminal SSE, em PT-BR
- [ ] Dedup inter-termos, elegibilidade (>= 5 vendas e produto novo) e o limite de 10 salvos por termo preservados; resumo final mantido
- [ ] Modo visível (headful) respeitado quando acionado
- [ ] Testes com subprocesso mockado (fixtures JSONL) cobrindo: termo com cards, termo sem elegíveis, termo com gate e falha de driver
- [ ] Demostração manual registrada no ticket: varredura real com login prévio (ver ticket 05 se disponível) concluída até o resumo no terminal