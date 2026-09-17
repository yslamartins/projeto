# 11: Download do Vídeo do TikTok via ssstik.io

**What to build:** Para produtos que já têm URL de vídeo no TikTok (`tikTokUrl`), surge um botão "Baixar vídeo". Ao clicá-lo, o app abre ssstik.io/pt no navegador (Chrome real), cola a URL do TikTok, clica em baixar em HD, espera o anúncio/intersticial renderizar, captura o link HD, baixa o MP4 para uma pasta privada (fora de `public/`) e registra `videoUrl`/`videoPath` + `videoStatus="downloaded"` no produto. Todo passo é reportado nos logs SSE, incluindo a espera do anúncio.

**Blocked by:** 09, 10

**Status:** resolved

## Comments

- `src/lib/ssstik/parsing.ts`: funcções puras para detectar e ranquear links de download do ssstik (HD sobre SD, anúncios descartados), normalização/fixturas de âncoras, detecção de texto de captcha/verificação. 10 testes sem rede.
- `src/lib/ssstik/download.ts`: módulo Playwright que navega para `ssstik.io/pt`, preenche a URL do TikTok, submete, espera o intersticial com polling (20s), captura o link HD, faz download via `context.request.get()` preservando cookies, salva em `.videos/<productId>.mp4` (tamanho mínimo 1KB validado), intercepta popups de anúncio e fecha automaticamente, retém logs SSE em cada etapa. Reutiliza perfil `.tiktok_profile`. Erros conhecidos: captcha/verificação do ssstik e intersticiais variam — experimente com "Modo Visível" e retome HITL.
- `src/app/api/video/download/route.ts`: rota `POST` que busca produto por id, valida `tikTokUrl`, chama `downloadTikTokVideo`, salva `videoUrl`, `videoPath` + `videoStatus="downloaded"` (ou `"failed"` em falha).
- UI: botão "Baixar vídeo (HD)" no card (aparece quando `tikTokUrl` existe, vira "Tentar baixar novamente" após falha), spinner individual, link "Baixar / ver vídeo" quando `videoStatus="downloaded"`. Dashboard: handler `handleDownloadVideo`, state `videoSearchingId` compartilhado entre busca e download, logs SSE emitidos em tempo real.
- Suíte: 61 testes verdes (10 novos do ssstik parsing), `tsc --noEmit` limpo.
- Aceite E2E real: produto com `tikTokUrl` preenchido → clicar "Baixar vídeo", resolver captcha se necessário no navegador visível, esperar download, arquivo MP4 em `.videos/`.

- [ ] Módulo ssstik: navega a ssstik.io/pt, preenche o campo com `tikTokUrl`, submete o download
- [ ] Espera e atravessa o intersticial/anúncio (timer/pular) e captura o link de download em HD
- [ ] Baixa o MP4 para pasta privada (ex.: `.videos/` fora de `public/`), com nome único por produto
- [ ] Salva `videoUrl` + `videoPath` + `videoStatus="downloaded"`; em falha, `videoStatus="failed"`
- [ ] Botão "Baixar vídeo" no card, habilitado apenas quando `tikTokUrl` existe
- [ ] Logs SSE em cada etapa (abrir ssstik, colar URL, baixar HD, aguardando anúncio, link HD, salvando arquivo, concluído/erro)
- [ ] Testes unitários do fluxo ssstik com fixtures de DOM (detecção do link HD, tratamento de anúncio/timer) sem rede
- [ ] Aceite E2E pode exigir HITL e varia conforme anti-bot do ssstik