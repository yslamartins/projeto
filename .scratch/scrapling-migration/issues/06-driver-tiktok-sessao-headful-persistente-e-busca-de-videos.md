# 06: Driver TikTok — sessão headful persistente + busca de vídeos

**What to build:** o driver Python do TikTok como subprocesso, espelhando o que o Playwright faz hoje: abrir uma sessão headful para login manual único (perfil persistente) e buscar vídeos para um termo (`/search?q=`, aguardar a página, detectar login-wall, rolar de forma humanizada, extrair os cards no mesmo formato já usado pelo search do TikTok em Node). Saída no contrato JSONL.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** ready-for-agent

- [ ] `collect tiktok session --headful` abre o navegador visível na página inicial do TikTok, sem automação, e aguarda o usuário logar; perfil persistido em diretório não commitado
- [ ] `collect tiktok search --q <termo>` navega a busca, detecta login-wall (sinalizando no resultado), rola de forma humanizada e devolve os cards de vídeo no formato usado hoje pelo `tiktok-search`
- [ ] Sessão headless das buscas reutiliza o login feito na sessão headful
- [ ] Fixture HTML de uma página de busca do TikTok salva no repositório e testes do parser sobre ela (sem rede)
- [ ] Execução manual contra o TikTok real registrada no ticket (busca, login-wall e cards observados)