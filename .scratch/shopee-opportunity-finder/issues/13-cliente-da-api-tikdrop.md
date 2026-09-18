# 13: Cliente da API TikDrop

**What to build:** Um módulo puro, sem navegador, que conversa com a API do TikDrop hospedada em `https://tikdrop-k8re.onrender.com`:
- `resolveTikTokVideo(url)`: chama `POST /v1/tiktok/resolve` com `{ url }` e tipa a resposta — `{ ok, data: { filename, media: { videoUrl, quality, mimeType, sizeBytes } }, error: { code } }`.
- `downloadTikTokVideoMp4(url)`: obtém o MP4 streaming via `GET /v1/tiktok/download?url=<url>` e grava no disco.

A base URL deve vir de variável de ambiente (`TIKDROP_API_URL`) com default `https://tikdrop-k8re.onrender.com`. Nenhum fluxo existente muda ainda: é só o alicerce HTTP para o ticket 14 usar.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `resolveTikTokVideo()` chama o endpoint de resolve com a URL do TikTok e devolve o metadado tipado (`filename`, `media.videoUrl`, `quality`, `sizeBytes`, `id`, `title`)
- [ ] `downloadTikTokVideoMp4()` baixa o MP4 via endpoint de download do TikDrop para o caminho desejado
- [ ] Base URL lida de env (`TIKDROP_API_URL`) com default apontando para o serviço em onrender
- [ ] Erros de rede/HTTP e respostas `ok:false` (incl. códigos `error.code`) são propagados de forma tipada
- [ ] Testes unitários com `fetch` mockado cobrem: sucesso do resolve, sucesso do download, erro de rede, resposta `ok:false` (sem depender de rede)