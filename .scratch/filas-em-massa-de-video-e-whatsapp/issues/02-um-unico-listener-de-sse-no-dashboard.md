# 02: Um único listener de SSE no dashboard

**What to build:** O dashboard abre uma conexão `EventSource('/api/scanner/logs')` e a fecha a cada ação, com o mesmo bloco de código copiado quatro vezes (varredura, busca, download e pipeline). Isso significa quatro conexões SSE abertas e encerradas ao longo da sessão do usuário, e vai virar seis quando as filas existirem. Este ticket extrai o bloco para um único hook reutilizável, de modo que qualquer ação do dashboard — inclusive as filas dos tickets seguintes — assine o mesmo stream de logs com uma linha, sem duplicar a lógica de subscribing, parsing e tratamento de erro.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Existe um único hook no dashboard que assina `/api/scanner/logs` e entrega os eventos parseados (tipo, mensagem e timestamp) para o terminal
- [x] Os quatro handlers existentes (varredura, busca, download, pipeline) passam a usar o hook e não abrem mais o `EventSource` por conta própria
- [x] Assinar e desassinar uma ação não derruba a conexão das outras: a varredura que já está em andamento continua recebendo seus logs enquanto uma ação de vídeo começa e termina
- [x] Erro ou queda do stream é tratado uma única vez no hook, sem `onerror` espalhado por handler
- [x] Os eventos de progresso continuam chegando ao terminal com os mesmos rótulos e a mesma ordenação de antes (nenhum teste existente de UI quebra)

**Nota:** a varredura atual detecta o fim do trabalho sondando `/api/scanner/status` a cada 2 segundos. Isso continua valendo — o hook cuida apenas do fluxo de logs, não do estado da tarefa.
