# 06: Driver TikTok — sessão headful persistente + busca de vídeos

**What to build:** o driver Python do TikTok como subprocesso, espelhando o que o Playwright faz hoje: abrir uma sessão headful para login manual único (perfil persistente) e buscar vídeos para um termo (`/search?q=`, aguardar a página, detectar login-wall, rolar de forma humanizada, extrair os cards no mesmo formato já usado pelo search do TikTok em Node). Saída no contrato JSONL.

**Blocked by:** 01-fundacao-ambiente-python-e-protocolo-cli

**Status:** resolved

- [x] `collect tiktok session --headful` abre o navegador visível na página inicial do TikTok, sem automação, e aguarda o usuário logar; perfil persistido em diretório não commitado
- [x] `collect tiktok search --q <termo>` navega a busca, detecta login-wall (sinalizando no resultado), rola de forma humanizada e devolve os cards de vídeo no formato usado hoje pelo `tiktok-search`
- [x] Sessão headless das buscas reutiliza o login feito na sessão headful
- [x] Fixture HTML de uma página de busca do TikTok salva no repositório e testes do parser sobre ela (sem rede)
- [x] Execução manual contra o TikTok real registrada no ticket (busca, login-wall e cards observados)

## Comments

### Como foi portado

- `shopee_parser.py` ganhou a camada pura do TikTok: `parse_tiktok_search_html` devolve os cards no formato exato do engine Node (`TikTokSearchCard` = `{href, caption, author}`). Mesma lógica de `tiktok-search.ts`: seletores `a[href*="/video/"]`, chave/dedup por href **sem** query string, autor via `/(@[\w.]+)/` na chave (strip `@`), e legenda = primeiro `span/div/p` com texto em até 4 ascendentes, slice 200.
- `collect.py` ganhou `action_session` (genérico p/ shopee/tiktok) e `action_tiktok_search`. O `session` abre headful, navega a home sem automação adicional e **segura o navegador aberto até a aba/janela ser fechada** (`hold_open` + `page.is_closed()`, com `retries=1` para não tentar reabrir depois), persistindo cookies no perfil ao sair.
- A busca do TikTok usa a mesma infra dos acordos dos tickets 01/02/03: `real_chrome=True`, `google_search=False`, `human_scroll` + `reset_cursor` humanizados, detecção de login-wall via `tiktok_block_kind` (assim como o `isTikTokBlocked` do engine) e contrato JSONL no stdout.
- O ranqueamento dos vídeos (`rankTikTokVideos`, `scoreTikTokCard`) continua no lado Node (ticket 07) — o driver Python devolve só os cards brutos.

### Achado real (2026-09-23)

- `collect tiktok search --q "mouse bluetooth" --save-fixture` ao vivo: **36 vídeos** na busca, **sem login-wall** (`"block": null`), cards completos ex. `{href: ".../@parzival_shop/video/7595823211514760469", caption, author: "parzival_shop"}`.
- No DOM real o contador de views/sales vive no **mesmo container** que a legenda → o `textContent` vem combinado (ex.: `"42✨ Mouse Sem Fio Bluetooth + 2.4GHz..."`), igual ao comportamento do engine original. Primeira versão do parser devolvia só o contador (`"832"`, `"743"`) — corrigido pulando candidatos puramente numéricos + colapsando whitespace; 0 captions fracos nas 36.
- `collect tiktok session` validado abrindo Chrome headful real e segurando até o encerramento manual.

### Testes

- Fixture real: `tests/fixtures/tiktok-search-mouse-bluetooth.html` (busca ao vivo, 36 cards).
- `tests/test_tiktok_parser.py`: 7 testes (extração, dedup por chave, autor, contador numérico pulado, prefixo combinado mantido, truncamento 200, smoke no fixture real).
- `pytest tools/scrapling/tests -q` → **23 passed** (16 Shopee + 7 TikTok), sem warnings.