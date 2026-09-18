# ADR 0002: Download de Vídeo do TikTok via API TikDrop

Data: 2026-09-18
Status: Accepted (substitui o item de download do ADR 0001)

## Context

O fluxo de download intermediado por ssstik.io exigia abrir um Chrome real, colar a URL, clicar em HD, atravessar o anúncio/intersticial e capturar o link — frágil a mudanças de layout, anti-bot, captchas e dependente de HITL. O projeto passa a ter um serviço próprio (self-hosted no Render) chamado TikDrop, que expõe uma API HTTP pura para resolver e baixar o vídeo sem navegador.

## Decision

- Trocar o intermediário de download de **ssstik.io** pela **API TikDrop** (`TIKDROP_API_URL`, default `https://tikdrop-k8re.onrender.com`).
- Fluxo: `POST /v1/tiktok/resolve` valida a URL e devolve metadados (tipo de conteúdo, qualidade, `media.videoUrl`, nome de arquivo); `GET /v1/tiktok/download?url=<url>` baixa o MP4 direto.
- O MP4 segue salvo na pasta privada `.videos/<productId>.mp4` com validação de magic bytes `ftyp`; o banco guarda `videoUrl` (URL de mídia do TikDrop), `videoPath` e `videoStatus`.
- Sem navegador na etapa de download: `headful` deixa de ser usado ali (continua valendo para a busca no TikTok). O perfil `.ssstik_profile` é desligado.
- `downloadTikTokVideo()` mantém a assinatura (rotas `/api/video/download` e `/api/video/pipeline` intactas em contrato); SSE continua reportando cada etapa.

## Consequences

- Download mais rápido, determinístico e sem anúncio/captcha/HITL nessa etapa.
- O plano free do Render pode dormir (cold start) — `TIKDROP_API_URL` permite apontar para outra instância sem mudar o código.
- Resta dependência de serviço externo próprio; códigos de erro do TikDrop são mapeados para mensagens amigáveis.