# 15: Desligar ssstik

**What to build:** Com o download migrado para TikDrop, todo o código e artefatos específicos do ssstik que não são mais necessários são removidos ou atualizados: módulo de parsing do ssstik, chamadas a `launchManagedChrome` no download, referências a `.ssstik_profile`, strings de UI/logs e documentação (ADR 0001, spec). `tsc --noEmit` limpo; suíte de testes verde.

**Blocked by:** 14 (Trocar download do TikTok para TikDrop)

**Status:** ready-for-agent

- [ ] Remover `src/lib/ssstik/parsing.ts` e seu arquivo de teste (ambos só eram usados pelo fluxo de download do ssstik)
- [ ] Remover de `download.ts` qualquer uso de `.ssstik_profile`, `launchManagedChrome`, `setActiveContext`/`closeActiveContext` e handlers de anúncio do ssstik
- [ ] Atualizar strings/logs: trocar menções a "ssstik.io/pt" por "TikDrop" no fluxo de download e no log inicial do botão
- [ ] Atualizar ADR 0001 para refletir a nova decisão (TikDrop, sem navegador para download) e marcar como superseded/superscrito em relação a etapa de download
- [ ] Revisar spec.md user story 18 — trocar referência a ssstik.io por TikDrop
- [ ] Limpar scripts de debug do ssstik (arquivos `debug-*.test.ts`/`.tmp.ts` na raiz) que não têm valor de produção
- [ ] `tsc --noEmit` limpo; `npx vitest run` verde