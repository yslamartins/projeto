# 01: Fundação — ambiente Python com Scrapling e protocolo CLI (spike de viabilidade)

**What to build:** a fundação de tudo: o ambiente Python com Scrapling funcionando no Windows e o contrato CLI entre Node e Python validado contra as páginas reais da Shopee e do TikTok. É o primeiro traço vertical — subir um navegador stealth, visitar uma URL real de cada site, emitir logs JSONL e fechar com resultado — que todos os demais drivers seguem.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `requirements.txt` com `scrapling[fetchers]` e documentação mínima de instalação (venv + `scrapling install`) que funcione no Windows com Python 3.12
- [ ] Script `collect.py` com subcomandos por site e um "handshake": `collect <site> ping` sobe `StealthySession`, navega uma URL real (Shopee e TikTok), imprime pelo menos uma linha `{"t":"log",...}` e fecha com `{"t":"result","ok":true,...}`
- [ ] Contrato JSONL estável documentado (formato `log` e linha final `result`), o mesmo que os drivers posteriores usam
- [ ] Verificado contra Shopee BR real: o steaalth do Scrapling renderiza a página de busca sem cair em gate `verify`/captcha, ou reporta o gate corretamente — registrado como comentário no ticket (cenário real de anti-bot)
- [ ] Verificado contra TikTok real: o browser do Scrapling abre a página de busca sem login-wall imediato — achado registrado no ticket
- [ ] Decisão registrada sobre persistência de perfil/login no Scrapling (diretório local de sessão vs browser próprio), que o ticket 05 e 06 herdam
- [ ] Os achados (versões, custo de browser, tempo de navegação, gates) anotados nos comentários do ticket para orientar os tickets seguintes