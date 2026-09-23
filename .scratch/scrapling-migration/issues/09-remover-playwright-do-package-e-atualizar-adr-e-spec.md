# 09: Remover `playwright` do `package.json` + atualizar ADR 0001 e spec

**What to build:** a saída definitiva do Playwright do projeto: remover a dependência dos manifests e alinhar a documentação de decisão com a nova arquitetura (automação de página via Scrapling para Shopee e TikTok), mantendo intocadas as decisões que continuam valendo (download por TikDrop em HTTP, vídeo em pasta privada servido por API, SSE, perfis persistentes fora do versionamento).

**Blocked by:** 08-contrato-remover-o-caminho-playwright-da-varredura

**Status:** ready-for-agent

- [ ] `playwright` removido do `package.json` e do lockfile (`npm rm`), com o `postinstall`/`patch-package` intacto
- [ ] Referências ao Playwright em `.gitignore`, `.env.example`/documentação de configuração e scripts avulsos removidas
- [ ] ADR 0001 atualizado: decisão registra Scrapling como motor de automação de página para a varredura (Shopee e TikTok); decisões de TikDrop, `.videos`, SSE e HITL permanecem
- [ ] `spec.md` do projeto atualizado com a nova decisão de implementação (automação via Scrapling; varredura como subprocesso Python; Playwright fora de escopo)
- [ ] `npm ci` + `npm run test` + `npm run build` verdes do zero (confirma que nada vivo usa o Playwright)