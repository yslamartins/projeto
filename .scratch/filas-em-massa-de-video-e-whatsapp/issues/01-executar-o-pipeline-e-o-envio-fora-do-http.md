# 01: Executar o pipeline e o envio de vídeo fora do HTTP

**What to build:** Hoje a busca + o download do vídeo e o envio ao WhatsApp só existem dentro dos handlers de rota (`/api/video/pipeline` e `/api/video/download`). Isso impede que qualquer outro ponto do sistema reaproveite a lógica sem passar por HTTP — é exatamente o que as filas em massa vão precisar fazer. Este ticket extrai essas duas operações para funções de lib chamáveis diretamente, sem mudar absolutamente nada do comportamento observável: as rotas viram adaptadores finos, o contrato HTTP permanece idêntico e o pipeline continua enviando ao WhatsApp no fim, como faz hoje. Nenhuma mudança de UI neste ticket.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] O pipeline de vídeo (buscar no TikTok + baixar via TikDrop) é executável chamando uma função de lib diretamente, com `{ productId, headful }` como entrada e um retorno que carrega o mesmo `success` / `step` (`search` | `download`) / `error` que a rota devolve hoje
- [x] O envio do vídeo de um produto ao grupo do WhatsApp é executável por uma função de lib que recebe o `productId`, carrega o produto, envia o vídeo com a legenda de nome + link e devolve `success` e `error` em vez de descartar o resultado
- [x] `POST /api/video/pipeline` e `POST /api/video/download` continuam respondendo exatamente o mesmo JSON e status HTTP de hoje (incluindo 400 sem `productId`, 404 de produto inexistente, 400 sem termo de busca e 409 com outra automação em andamento)
- [x] O pipeline continua enviando ao WhatsApp automaticamente ao final, como hoje, e uma falha de envio continua não reverte o `videoStatus` para `downloaded`
- [x] Testes unitários das novas funções de lib cobrem: busca que falha marcando `videoStatus` como `failed` e retornando `step: 'search'`; download que falha retornando `step: 'download'`; sucesso; e envio ao WhatsApp chamado junto com o caminho do arquivo baixado
- [x] A suíte existente de rotas e de WhatsApp continua passando sem ter sido reescrita
