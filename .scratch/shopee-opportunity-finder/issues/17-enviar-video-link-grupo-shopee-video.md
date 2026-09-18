# 17: Enviar vídeo e link do produto para o grupo "SHOPEE VIDEO"

**What to build:** Depois de baixar o vídeo de um produto (no fluxo "Baixar Vídeo" ou no pipeline "Buscar e Baixar Vídeo"), o app envia ao grupo do WhatsApp chamado exatamente "SHOPEE VIDEO" o vídeo baixado com legenda contendo o nome do produto e o link do produto no Shopee. O envio é best-effort: se falhar (não logado, grupo não encontrado, erro de rede), o download continua valendo como `downloaded` e o erro aparece em logs SSE sem reverter o download.

**Blocked by:** 16 (Sessão do WhatsApp via whatsapp-web-js)

**Status:** ready-for-agent

- [x] Após download bem-sucedido em ambos os fluxos ("Baixar Vídeo" e pipeline), o vídeo `.mp4` salvo é enviado para o grupo com nome exatamente igual a "SHOPEE VIDEO"
- [x] Legenda da mídia contém o nome do produto e o link do produto no Shopee
- [x] Grupo não encontrado, sessão não conectada ou falha de rede resultam em erro amigável via SSE, sem alterar `videoStatus` (continua `downloaded`)
- [x] Logs SSE cobrem cada etapa do envio (conectando/procurando grupo → enviando vídeo → vídeo enviado ou erro não bloqueante)
- [x] Testes com envio mockado cobrem: envio com sucesso, grupo não encontrado e sessão não conectada (sem depender de rede/WhatsApp real)