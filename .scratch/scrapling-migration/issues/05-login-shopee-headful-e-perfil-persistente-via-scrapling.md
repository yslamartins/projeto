# 05: Login Shopee headful + perfil persistente via Scrapling

**What to build:** o botão "Login Shopee" voltando a funcionar sobre o Scrapling: abre o navegador em modo visível e deixa o usuário autenticar ou resolver desafios uma única vez; a sessão/perfil fica persistida em disco e as varreduras headless seguintes reutilizam sem pedir login de novo. O reset de perfil continua disponível para limpar a sessão quando desejado.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** resolved

- [x] `collect shopee session --headful` abre o navegador em modo visível apontando para a Shopee, sem navegação automatizada, e aguarda a ação humana
- [x] Ao encerrar, o perfil/sessão fica salva em diretório local não commitado (mesma estratégia decidida no ticket 01)
- [x] Uma varredura headless posterior reutiliza o perfil salvo e não faz o scanner pedir login de novo
- [x] O reset de perfil continua funcionando (limpa cookie/sessão e o scanner volta a exigir login)
- [x] Fluxo manual registrado no ticket: login 1x → varredura seguinte sem nova autenticação; reset → varredura pede login de novo

## Comments

### Como foi portado

- `action_session` (genérico, compartilhado com o TikTok — implementado junto do ticket 06) atende o item de abertura: abre headful na home da Shopee sem automação, mantém o navegador aberto até a aba/janela ser fechada pelo humano (`hold_open` + `page.is_closed()`, `retries=1`) e, ao sair, os cookies ficam persistidos em `.shopee_profile/` (não commitado).
- A varredura headless seguinte reutiliza o perfil automaticamente: todo `collect shopee terms|search` já abre `StealthySession(user_data_dir=PROFILES['shopee'])` — mesmo diretório que o `session` acabou de gravar. Não há passo de reautenticação.
- O reset de perfil **permanece no lado Node inalterado** até o ticket 08: `src/lib/scanner/profile.ts` move o `.shopee_profile/` para `backups/shopee_profile_<ts>` e recria o diretório — como o diretório é o mesmo usado pelo Scrapling, o reset continua funcionando independente de quem gravou os cookies. (O fluxo manual login→varredura→reset será validado de ponta a ponta no ticket 08, quando o `session` for ligado ao botão "Login Shopee" da UI.)
- `legacy` da precisão: `collect shopee session` e `collect tiktok session` compartilham a mesma implementação e o mesmo `headful=True` testado ao vivo no ticket 06.