# 09: Remover `playwright` do `package.json` + atualizar ADR 0001 e spec

**What to build:** a saída definitiva do Playwright do projeto: remover a dependência dos manifests e alinhar a documentação de decisão com a nova arquitetura (automação de página via Scrapling para Shopee e TikTok), mantendo intocadas as decisões que continuam valendo (download por TikDrop em HTTP, vídeo em pasta privada servido por API, SSE, perfis persistentes fora do versionamento).

**Blocked by:** 08-contrato-remover-o-caminho-playwright-da-varredura

**Status:** ready-for-agent

- [x] `playwright` removido do `package.json` e do lockfile (`npm rm`), com o `postinstall`/`patch-package` intacto
- [x] Referências ao Playwright em `.gitignore`, `.env.example`/documentação de configuração e scripts avulsos removidas
- [x] ADR 0001 atualizado: decisão registra Scrapling como motor de automação de página para a varredura (Shopee e TikTok); decisões de TikDrop, `.videos`, SSE e HITL permanecem
- [x] `spec.md` do projeto atualizado com a nova decisão de implementação (automação via Scrapling; varredura como subprocesso Python; Playwright fora de escopo)
- [ ] `npm ci` + `npm run test` + `npm run build` verdes do zero (confirma que nada vivo usa o Playwright) — **pendente: usuário roda o build localmente** (`npm run test` já verde após o `npm rm`; `npx tsc --noEmit` limpo)

Nota (implementação concluída):
- `npm rm playwright` removeu o pacote direto (`playwright`/`playwright-core`); restam apenas referências de `peerDependenciesMeta` do `next` (opcional, não instalada).
- Suíte completa: 17 arquivos / 145 testes verdes após a remoção.
- ADR 0001 e `spec.md` do projeto reescritos para refletir o motor Scrapling (subprocesso Python) e a saída do Playwright.