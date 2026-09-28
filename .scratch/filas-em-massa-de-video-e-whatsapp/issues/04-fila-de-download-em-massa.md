# 04: Fila de download em massa

**What to build:** Hoje é preciso clicar produto por produto para baixar os vídeos das oportunidades encontradas. Este ticket entrega um botão que cria uma fila com todos os produtos que ainda não têm vídeo e processa essa fila em segundo plano: a varredura de vídeo roda um produto por vez, o progresso aparece no terminal como "3 de 10", um item que falha não derruba a fila, e há um botão para parar a fila no meio. Ao final, a lista de produtos reflete os downloads concluídos.

O botão fica na barra de controle, ao lado de "Iniciar Varredura Automática".

**Blocked by:** 01 (executar o pipeline e o envio fora do HTTP), 02 (um único listener de SSE no dashboard).

**Status:** ready-for-agent

- [x] Um botão "Fila: Baixar Todos os Vídeos" na barra de controle cria a fila com todo produto cujo vídeo ainda não foi baixado e responde imediatamente, sem esperar a fila terminar
- [x] A fila é processada em segundo plano, um produto por vez, e o progresso chega ao terminal em tempo real no formato "N de M"
- [x] Enfileirar responde 409 se já houver uma fila em andamento, e também 409 se houver uma varredura da Shopee em andamento
- [x] Uma varredura da Shopee não pode ser iniciada enquanto houver uma fila em andamento
- [x] Enquanto a fila roda, os botões de vídeo dos cards ficam desabilitados
- [x] Um produto que falha na busca ou no download é registrado como falho e a fila **continua** para o próximo; ao final o terminal traz um resumo com quantos concluíram e quantos falharam
- [x] "Parar Fila" interrompe a fila entre um item e outro: o item em andamento termina, os restantes não são processados e o estado da fila volta a ficar ocioso
- [x] Produto que já tem `tikTokUrl` guardada vai direto para o download, sem repetir a busca no TikTok
- [x] Entre um item e outro há uma pausa humanizada, na mesma proporção usada entre termos da varredura, para não martelar o TikTok e o TikDrop em sequência
- [x] A lista de produtos na tela é atualizada ao final da fila, com `videoStatus` correto em cada card
- [x] O estado da fila (ociosa, em andamento, total, concluídos, falhas, produto atual) é consultável por uma rota
- [x] Testes cobrem: a fila processa vários produtos em sequência na ordem enfileirada; pula quem já tem vídeo baixado; um item que falha não interrompe os seguintes; "Parar Fila" impede os itens restantes; e a exclusão mútua com a varredura e com uma segunda fila
- [x] Os testes de fila não dependem de TikTok, TikDrop ou WhatsApp reais

**Nota:** hoje a exclusão mútua é um par de booleanos no barramento de eventos. A fila precisa do seu próprio estado para saber se está ociosa, e o guarda existente de "outra automação em andamento" precisa passar a considerar a fila. A trava é sempre liberada, inclusive quando o worker estoura erro inesperado.
