# 01: Remover o fluxo HTTP de conexão por QR e o estado `waiting_qr`

**What to build:** O WhatsApp deixa de se conectar por QR servido via HTTP. O endpoint `GET /api/whatsapp/qr` não existe mais; toda a infraestrutura que o alimentava — geração de Data URL do QR, impressão do QR no terminal, rastreio do `currentQr`, evento `qrAvailable` nos logs SSE e a aguardação com timeout — é removida. A máquina de estados do WhatsApp passa de `disconnected | waiting_qr | connecting | connected` para `disconnected | connecting | connected`. O handler `'qr'` do whatsapp-web.js continua existindo apenas para emitir mensagem de guia nos logs. As mensagens do fluxo de envio deixam de citar a URL `/api/whatsapp/qr`. Daqui em diante a conexão é feita apenas pelo navegador visível (ticket 02), sem endpoint.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `GET /api/whatsapp/qr` não existe mais (rotas e testes do endpoint removidos) e responde `404`
- [ ] Removidos `requestWhatsAppQr`, Data URL do QR, `printQrToTerminal`, `currentQr`, `qrAvailable` e as constantes de timeout/poll de QR
- [ ] Estado `waiting_qr` removido: `WhatsAppState` fica `disconnected | connecting | connected`; nada mais consulta `waiting_qr` (status route, logs, testes)
- [ ] Handler `'qr'` mantém apenas emissão de guia nos logs (sem gerar imagem nem trocar estado além de `connecting`)
- [ ] Mensagens de envio (`send.ts`) não citam mais `/api/whatsapp/qr` e o branch `waiting_qr` é removido
- [ ] `client.test.ts`, `status/route.test.ts` e demais testes atualizados; suíte e `tsc` verdes
- [ ] `grep` global não encontra mais referências a `waiting_qr` nem a `/api/whatsapp/qr` no código