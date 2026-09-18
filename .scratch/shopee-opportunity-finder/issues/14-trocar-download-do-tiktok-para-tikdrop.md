# 14: Trocar download do TikTok para TikDrop

**What to build:** O botão "Baixar vídeo" (e o pipeline "Buscar e Baixar Vídeo") passam a baixar via TikDrop em vez do ssstik.io. Ao clicar: o app resolve a URL do TikTok pela API TikDrop (ticket 13), baixa o MP4 para `.videos/<productId>.mp4`, valida o arquivo e registra `videoUrl` + `videoPath` + `videoStatus="downloaded"`; em falha, `videoStatus="failed"` com mensagem amigável. Nenhum navegador é aberto nessa etapa — `headful` deixa de ser relevante para o download, mas continua valendo na busca. Os logs SSE continuam cobrindo cada etapa (resolvendo → baixando → salvando → concluído/erro).

**Blocked by:** 13 (Cliente da API TikDrop)

**Status:** ready-for-agent

- [ ] `downloadTikTokVideo()` (assinatura exportada mantida) passa a usar o cliente TikDrop em vez da automação Playwright do ssstik
- [ ] Resolve a URL via `resolveTikTokVideo()`; se a resposta indicar conteúdo não-vídeo ou indisponível, falha com mensagem mapeada do código de erro do TikDrop
- [ ] MP4 baixado para `.videos/<productId>.mp4` (pasta privada) e validado (magic bytes MP4 + tamanho mínimo)
- [ ] Válido → salva `videoUrl` (URL de mídia do TikDrop) + `videoPath` + `videoStatus="downloaded"`; falha → `videoStatus="failed"`
- [ ] Logs SSE disparados em cada etapa do novo fluxo (sem referência a "navegando para ssstik")
- [ ] Rotas `/api/video/download` e `/api/video/pipeline` seguem funcionando com a mesma assinatura da função (gestão de `videoStatus`/`videoUrl`/`videoPath` inalterada)
- [ ] `headful` aceito pelas rotas mas ignorado na etapa de download (busca do TikTok continua usando navegador)
- [ ] Testes: cliente mockado nos testes das rotas (mocks hoje apontam para o módulo ssstik — atualizar), + cenários de erro mapeados (ex.: `rate_limited`, `video_unavailable`, `unsupported_content`)