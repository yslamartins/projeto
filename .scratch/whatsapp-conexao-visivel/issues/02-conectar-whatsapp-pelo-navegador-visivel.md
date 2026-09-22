# 02: Conectar o WhatsApp pelo navegador visível (`headless: false` por padrão)

**What to build:** A conexão do WhatsApp passa a ser feita sempre por um navegador Chrome **visível**, espelhando o padrão das sessões Shopee/TikTok. No primeiro envio (lazy, sob demanda), o navegador visível abre com o WhatsApp Web mostrando o QR para o usuário escanear **na própria janela**; os logs SSE guiam "escaneie o QR na janela aberta". A sessão `LocalAuth` segue sendo salva e reaproveitada nos envios seguintes (sem novo scan). `WHATSAPP_HEADLESS` continua existindo: o default é navegador visível, e `WHATSAPP_HEADLESS=true` volta a ocultar (escape). Isso elimina o erro persistente "Envio ao WhatsApp ignorado: WhatsApp não está conectado. Abra /api/whatsapp/qr..." — com a janela visível o QR é escaneável e o envio flui até o sucesso.

**Blocked by:** 01 (Remover o fluxo HTTP de conexão por QR e o estado `waiting_qr`)

**Status:** ready-for-agent

- [ ] `buildClient` usa `headless: process.env.WHATSAPP_HEADLESS === 'true'` (navegador visível por padrão)
- [ ] No 1º envio (lazy), o navegador visível abre e o usuário escaneia o QR na própria janela; mensagens dos logs indicam claramente que a janela está aberta aguardando o scan
- [ ] Sessão `LocalAuth` é retomada nos próximos envios sem exigir novo scan
- [ ] `WHATSAPP_HEADLESS=true` continua ocultando o navegador (escape documentado)
- [ ] `.env.example` documenta o novo default (visível) e o escape
- [ ] Fluxo E2E: rodar o pipeline → janela abre → escanear → `connected` → vídeo enviado ao grupo, sem o erro de "WhatsApp não está conectado. Abra /api/whatsapp/qr"
- [ ] Testes atualizados para o novo default de visível e `tsc` verdes