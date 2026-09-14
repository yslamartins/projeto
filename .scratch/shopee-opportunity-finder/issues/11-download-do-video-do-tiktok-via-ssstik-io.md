# 11: Download do Vídeo do TikTok via ssstik.io

**What to build:** Para produtos que já têm URL de vídeo no TikTok (`tikTokUrl`), surge um botão "Baixar vídeo". Ao clicá-lo, o app abre ssstik.io/pt no navegador (Chrome real), cola a URL do TikTok, clica em baixar em HD, espera o anúncio/intersticial renderizar, captura o link HD, baixa o MP4 para uma pasta privada (fora de `public/`) e registra `videoUrl`/`videoPath` + `videoStatus="downloaded"` no produto. Todo passo é reportado nos logs SSE, incluindo a espera do anúncio.

**Blocked by:** 09, 10

**Status:** ready-for-agent

- [ ] Módulo ssstik: navega a ssstik.io/pt, preenche o campo com `tikTokUrl`, submete o download
- [ ] Espera e atravessa o intersticial/anúncio (timer/pular) e captura o link de download em HD
- [ ] Baixa o MP4 para pasta privada (ex.: `.videos/` fora de `public/`), com nome único por produto
- [ ] Salva `videoUrl` + `videoPath` + `videoStatus="downloaded"`; em falha, `videoStatus="failed"`
- [ ] Botão "Baixar vídeo" no card, habilitado apenas quando `tikTokUrl` existe
- [ ] Logs SSE em cada etapa (abrir ssstik, colar URL, baixar HD, aguardando anúncio, link HD, salvando arquivo, concluído/erro)
- [ ] Testes unitários do fluxo ssstik com fixtures de DOM (detecção do link HD, tratamento de anúncio/timer) sem rede
- [ ] Aceite E2E pode exigir HITL e varia conforme anti-bot do ssstik