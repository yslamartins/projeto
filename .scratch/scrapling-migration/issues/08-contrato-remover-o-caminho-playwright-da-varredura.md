# 08: Contrato — remover o caminho Playwright da varredura (expand–contract)

**What to build:** limpar a casa. Com a Shopee (tickets 02–05) e o TikTok (06–07) migrados para os drivers Python, os módulos que só existiam para levar o Playwright à varredura deixam de ser usados: lançador de Chrome gerenciado, script de stealth, humanização de mouse/scroll, sessão/perfil da Shopee em Playwright, serialização de contexto ativo e imports mortos restantes. Ao final, a varredura não referencia mais Playwright em nenhum caminho vivo.

**Blocked by:** 04-integrar-shopee-no-engine-node-spawn-do-driver, 05-login-shopee-headful-e-perfil-persistente-via-scrapling, 07-integrar-tiktok-no-node-spawn-do-driver

**Status:** ready-for-agent

- [ ] Nenhum caminho vivo da varredura (Shopee ou TikTok) importa o Playwright
- [ ] Módulos dedicados ao browser do Playwright (lançador, stealth, humanização, sessão/perfil, contexto ativo) removidos junto com seus imports órfãos
- [ ] Scripts de diagnóstico avulsos que dependiam do Playwright removidos ou marcados como obsoletos
- [ ] Suíte de testes e `npm run test` verdes após a remoção (sem rede, fixtures mantidas)
- [ ] `npm run build` passa sem o caminho antigo da varredura