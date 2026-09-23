# 05: Login Shopee headful + perfil persistente via Scrapling

**What to build:** o botão "Login Shopee" voltando a funcionar sobre o Scrapling: abre o navegador em modo visível e deixa o usuário autenticar ou resolver desafios uma única vez; a sessão/perfil fica persistida em disco e as varreduras headless seguintes reutilizam sem pedir login de novo. O reset de perfil continua disponível para limpar a sessão quando desejado.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** ready-for-agent

- [ ] `collect shopee session --headful` abre o navegador em modo visível apontando para a Shopee, sem navegação automatizada, e aguarda a ação humana
- [ ] Ao encerrar, o perfil/sessão fica salva em diretório local não commitado (mesma estratégia decidida no ticket 01)
- [ ] Uma varredura headless posterior reutiliza o perfil salvo e não faz o scanner pedir login de novo
- [ ] O reset de perfil continua funcionando (limpa cookie/sessão e o scanner volta a exigir login)
- [ ] Fluxo manual registrado no ticket: login 1x → varredura seguinte sem nova autenticação; reset → varredura pede login de novo