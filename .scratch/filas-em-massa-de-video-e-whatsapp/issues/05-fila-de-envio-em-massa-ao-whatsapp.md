# 05: Fila de envio em massa ao WhatsApp

**What to build:** O ticket anterior entregou a fila de download; este entrega a fila de envio. Um botão cria a fila com todos os produtos que já têm vídeo baixado e que ainda não foram enviados ao grupo, e o worker envia um a um, com progresso no terminal, botão para parar e registro do estado de envio de cada produto. É a segunda metade do atalho de produção: o usuário termina o dia com uma leva de vídeos baixados e manda o lote inteiro para o grupo em um clique.

O botão fica na barra de controle, ao lado do botão da fila de download.

**Blocked by:** 03 (buscar/baixar e enviar como ações separadas), 04 (fila de download em massa).

**Status:** ready-for-agent

- [x] Um botão "Fila: Enviar Todos para o WhatsApp" cria a fila com todo produto que tem vídeo baixado e cujo envio ainda não deu certo, e responde imediatamente
- [x] A fila é processada em segundo plano, um produto por vez, com progresso no terminal no formato "N de M"
- [x] Cada item enviado com sucesso grava o estado de envio e a data/hora no produto, e o card passa a mostrar "Enviado"
- [x] Produto que falha no envio fica registrado como falha de envio, a fila continua para o próximo, e o resumo final informa quantos foram enviados e quantos falharam
- [x] "Parar Fila" interrompe entre um item e outro, sem perder o que já foi enviado
- [x] Enfileirar responde 409 se já houver uma fila em andamento, e a varredura da Shopee não pode ser iniciada com a fila rodando
- [x] Produto que já foi enviado com sucesso não entra na fila de novo — clicar duas vezes não duplica mensagem no grupo
- [x] Enviar a fila respeita a mesma trava de exclusão mútua e o mesmo cancelamento da fila de download
- [x] A legenda de cada mensagem continua sendo o nome do produto seguido do link na Shopee
- [x] Testes cobrem: envia apenas quem tem vídeo baixado e não foi enviado; registra o envio; um item que falha não interrompe os seguintes; cancelar impede os restantes; e produto já enviado não é enfileirado de novo
- [x] Os testes de fila não dependem de WhatsApp real

**Nota:** o runner sequencial, o cancelamento e o estado de fila vêm prontos do ticket 04. Este ticket registra um worker de envio ao lado do worker de download, não uma segunda máquina de filas. O alvo continua sendo o grupo cujo nome é exatamente "SHOPEE VIDEO".
