# 03: Buscar/baixar e enviar ao WhatsApp como ações separadas

**What to build:** Hoje baixar um vídeo e enviá-lo ao WhatsApp são a mesma ação: o pipeline e o download chamam o envio automaticamente ao final, e o resultado do envio é descartado — o app não sabe o que já mandou para o grupo. Isso muda: "Buscar e Baixar Vídeo" passa a ser só buscar e baixar, e o envio ao WhatsApp vira uma ação separada, disparada por um botão novo no card. Para que a ação separada seja segura de repetir, o produto passa a registrar se o vídeo já foi enviado.

Concretamente, depois deste ticket: clicar em "Buscar e Baixar Vídeo" baixa o vídeo e **não** manda nada ao WhatsApp; clicar no botão novo ao lado envia **só** aquele vídeo; o card mostra "Enviado" e trava o botão depois do sucesso.

**Blocked by:** 01 (executar o pipeline e o envio fora do HTTP).

**Status:** ready-for-agent

- [x] "Buscar e Baixar Vídeo" e "Baixar vídeo (HD)" param de enviar ao WhatsApp; uma falha de envio no pipeline não é mais possível porque o envio não existe mais nesses caminhos
- [x] O card tem um botão "Enviar pelo WhatsApp" lado a lado (50/50) com o botão de buscar/baixar, visível quando o produto tem vídeo baixado
- [x] O envio de um produto é feito por uma rota dedicada que recebe o `productId` e responde sucesso ou erro — grupo não encontrado, sessão não conectada e erro de rede chegam ao terminal como mensagem amigável
- [x] O produto passa a registrar o estado do envio (`none` | `sent` | `failed`) e a data/hora do envio bem-sucedido, e esse estado sobrevive a reinício do servidor
- [x] Depois de um envio bem-sucedido, o card mostra o status "Enviado" e o botão fica marcado como já enviado, sem permitir reenvio acidental por clique
- [x] A legenda enviada ao grupo continua sendo o nome do produto seguido do link do produto na Shopee
- [x] Envio é best-effort: uma falha de envio nunca altera o `videoStatus` do produto, que continua `downloaded`
- [x] Testes cobrem: envio com sucesso marca o estado; grupo não encontrado; sessão não conectada; e o botão fica indisponível para produto já enviado
- [x] Os testes que hoje afirmam que o pipeline chama o WhatsApp passam a afirmar que **não** chama

**Nota:** o `Product` hoje tem só `status` e `videoStatus` como campos de estado, ambos `String` livre validados à mão. O novo campo segue o mesmo padrão de validação e precisa sobreviver ao teste de integração que reescreve o schema num SQLite temporário.
