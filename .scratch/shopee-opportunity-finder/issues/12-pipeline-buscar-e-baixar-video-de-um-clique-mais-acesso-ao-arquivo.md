# 12: Pipeline "Buscar e Baixar Vídeo" de Um Clique + Acesso ao Arquivo

**What to build:** Os fluxos de busca no TikTok (10) e download via ssstik (11) se tornam um único pipeline acionável pelo card: botão "Buscar e Baixar Vídeo" encadeia buscar ✨→ baixar, atualizando `tikTokUrl` e depois `videoUrl`/`videoPath`/`videoStatus` conforme cada etapa avança, com logs SSE do começo ao fim. Ao concluir, o produto fica com `videoStatus="downloaded"` e o card mostra o player/preview do MP4 servido por uma rota de vídeo (pasta privada, não `public/`). O status do produto (Pendente/Vídeo Publicado/Descartado) continua sendo decisão do usuário e não muda automaticamente.

**Blocked by:** 10, 11

**Status:** ready-for-agent

- [ ] Botão único "Buscar e Baixar Vídeo" encadeando busca→download no card do produto
- [ ] Rota de API de vídeo servindo o MP4 da pasta privada (identificada pelo produto), sem expor diretórios do `public/`
- [ ] Card do produto exibe badge de `videoStatus` e player/preview quando `downloaded`
- [ ] `videoStatus` transita `none → searched → downloaded` (ou `failed`) conforme o pipeline
- [ ] Produto permanece `pending` após download (sem automação de `published`)
- [ ] Logs SSE cobrindo o pipeline inteiro, incluindo falhas intermediárias com retorno de estado consistente no banco
- [ ] Testes: rota de vídeo (path traversal e 404), transição de status no pipeline e exibição condicional no card
- [ ] Aceite E2E pode exigir HITL para login/anti-bot (TikTok e ssstik)