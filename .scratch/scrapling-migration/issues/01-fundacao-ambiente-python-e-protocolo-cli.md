# 01: Fundação — ambiente Python com Scrapling e protocolo CLI (spike de viabilidade)

**What to build:** a fundação de tudo: o ambiente Python com Scrapling funcionando no Windows e o contrato CLI entre Node e Python validado contra as páginas reais da Shopee e do TikTok. É o primeiro traço vertical — subir um navegador stealth, visitar uma URL real de cada site, emitir logs JSONL e fechar com resultado — que todos os demais drivers seguem.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `requirements.txt` com `scrapling[fetchers]` e documentação mínima de instalação (venv + `scrapling install`) que funcione no Windows com Python 3.12
- [x] Script `collect.py` com subcomandos por site e um "handshake": `collect <site> ping` sobe `StealthySession`, navega uma URL real (Shopee e TikTok), imprime pelo menos uma linha `{"t":"log",...}` e fecha com `{"t":"result","ok":true,...}`
- [x] Contrato JSONL estável documentado (formato `log` e linha final `result`), o mesmo que os drivers posteriores usam
- [x] Verificado contra Shopee BR real: o steaalth do Scrapling renderiza a página de busca sem cair em gate `verify`/captcha, ou reporta o gate corretamente — registrado como comentário no ticket (cenário real de anti-bot)
- [x] Verificado contra TikTok real: o browser do Scrapling abre a página de busca sem login-wall imediato — achado registrado no ticket
- [x] Decisão registrada sobre persistência de perfil/login no Scrapling (diretório local de sessão vs browser próprio), que o ticket 05 e 06 herdam
- [x] Os achados (versões, custo de browser, tempo de navegação, gates) anotados nos comentários do ticket para orientar os tickets seguintes

## Comments

### Ambiente (Windows, Python 3.12)

- `.venv/` na raiz (gitignored) + `tools/scrapling/requirements.txt` com `scrapling[fetchers]>=0.4.15`.
- `scrapling install` baixa os browsers do Playwright/patchright; completo e funcional.
- Scrapling 0.4.15 usa **patchright** (fork stealth do Playwright) por baixo dos panos — a automação continua Playwright-like, o que favorece portar o driver sem reinventar a API de página.

### Contrato CLI (decisão)

- `python tools/scrapling/collect.py <site> ping [--headful]`
- Linhas `{"t":"log","level":...,"message":...}` + linha final `{"t":"result","ok":...,"data"|"error"}`.
- Perfis: `.shopee_profile/` e `.tiktok_profile/` via `user_data_dir` da `StealthySession` — **persistência de sessão resolvida** (mesmo perfil usado pelo caminho antigo; login HITL reutilizável nos tickets 05/06).

### Achado crítico anti-bot (reprodutido ao vivo)

- **Default (`real_chrome=False` + `google_search=True`) → GATE.** A Shopee respondeu `GET https://shopee.com.br/verify/captcha?...&scene=crawler_item` (HTTP 200). O referer do Google (`google_search`, default ligado) marca a requisição como crawler.
- **`real_chrome=True` + `google_search=False` → PASSA LIMPO.** Home da Shopee 200, título correto, sem `/verify/`. Perfil `.shopee_profile` existente (cookies do login manual) aproveitado.
- Gate ainda é detectado e reportado como `ok:false` com a mensagem PT-BR do engine (verificado com o default: `block:"security"`, exit 1).

### TikTok

- `collect tiktok ping` → HTTP 200, título `TikTok - Make Your Day`, **sem login-wall** na home. Login-wall permanece como checagem obrigatória do driver de busca (ticket 06).

### Custo/estabilidade

- Ping completo (abrir browser + navegar + humanizar + fechar) ~20–30 s por site, incluindo aba aberta do Chrome real.
- `page_action` pode falhar com `Execution context was destroyed` quando a página navega sozinha (TikTok); a ação de humanização do driver já envolve try/except para não abortar o fetch.

### Instrução para os próximos tickets

- Todo driver novo usa `open_session()` deste arquivo (já com `real_chrome=True` + perfil persistente) e o par `emit_log`/`emit_result`.
- `page_action` é o ponto de entrada para humanização (mouse + scroll) pós-navegação.