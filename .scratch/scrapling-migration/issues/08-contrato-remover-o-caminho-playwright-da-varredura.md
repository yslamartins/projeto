# 08: Contrato — remover o caminho Playwright da varredura (expand–contract)

**What to build:** limpar a casa. Com a Shopee (tickets 02–05) e o TikTok (06–07) migrados para os drivers Python, os módulos que só existiam para levar o Playwright à varredura deixam de ser usados: lançador de Chrome gerenciado, script de stealth, humanização de mouse/scroll, sessão/perfil da Shopee em Playwright, serialização de contexto ativo e imports mortos restantes. Ao final, a varredura não referencia mais Playwright em nenhum caminho vivo.

**Blocked by:** 04-integrar-shopee-no-engine-node-spawn-do-driver, 05-login-shopee-headful-e-perfil-persistente-via-scrapling, 07-integrar-tiktok-no-node-spawn-do-driver

**Status:** ready-for-agent

- [x] Nenhum caminho vivo da varredura (Shopee ou TikTok) importa o Playwright
- [x] Módulos dedicados ao browser do Playwright (lançador, stealth, humanização, sessão/perfil, contexto ativo) removidos junto com seus imports órfãos
- [x] Scripts de diagnóstico avulsos que dependiam do Playwright removidos ou marcados como obsoletos
- [x] Suíte de testes e `npm run test` verdes após a remoção (sem rede, fixtures mantidas)
- [ ] `npm run build` passa sem o caminho antigo da varredura — **pendente: usuário roda o build localmente** (`npx tsc --noEmit` já verde)

Nota (implementação concluída):
- Removidos: `chrome-launcher`, `browser-context`, `stealth`, `humanize`, `api-search` (+ `api-search.test`), `scratch/diagnose-shopee.mjs`, `scratch/diag-*.json`, `scratch/shopee-search-debug.png`, `scratch/_probe-managed.ts`.
- `profile.ts` agora encerra a sessão do driver via `killActiveCollectSession()` (spawn-driver) antes de renomear o `.shopee_profile`.
- Suíte completa: 17 arquivos / 145 testes verdes; `tsc --noEmit` sem erros.
- Último item pendente é o build de aceitação (execução manual do usuário nesta máquina).