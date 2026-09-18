# 16: Sessão do WhatsApp via whatsapp-web-js (login por QR)

**What to build:** O app passa a ter uma sessão do WhatsApp Web via `whatsapp-web-js` (browser Playwright), mantida como um cliente único no processo. No primeiro login o usuário escaneia um QR code; a sessão é persistida localmente para não exigir novo escaneamento depois. O estado da conexão e o QR aparecem em logs SSE, e um endpoint devolve a imagem do QR para escaneamento. Nenhum fluxo existente muda ainda: é o alicerce para o envio ao grupo (ticket 17).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `whatsapp-web-js` adicionado às dependências, com sessão persistida numa pasta local gitignored (nunca commitada)
- [x] Cliente WhatsApp único (singleton) que inicializa de forma idempotente e reaproveita a sessão salva entre execuções
- [x] Eventos de conexão (`qr`, `authenticated`, `ready`, `disconnected`) emitem logs SSE para o usuário acompanhar
- [x] Endpoint de QR devolve a imagem do QR atual (para o primeiro login ou reautenticação)
- [x] Endpoint de status informa se a sessão está conectada, aguardando QR ou desconectada
- [x] Testes cobrem os endpoints/comportamento sem depender de rede (cliente mockado), incluindo reconexão com sessão salva