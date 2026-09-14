# 07: Coleta de Até 10 Produtos Elegíveis por Termo em Alta

**What to build:** A varredura deixa de parar no primeiro produto elegível (limitada a 5 termos) e passa a coletar até **10 produtos elegíveis por termo em alta**, priorizando quantidade por termo: analisa até 30 produtos de cada termo, salva **todos** os elegíveis (vendas >= 5, ainda não salvos) até o termo atingir 10, e então avança para o próximo termo. O limite rígido de 5 termos é removido; a varredura considera até 20 termos por execução (extraídos da página + fallback da lista completa em falta). Não há teto global: cada termo pode contribuir com até 10 produtos.

Exemplo esperado: se o primeiro termo tiver 7 produtos elegíveis entre os 30 analisados, salvar os 7; o próximo termo com 4 elegíveis salva os 4, e assim por diante (máx 10 por termo).

**Blocked by:** None (can start immediately)

**Status:** resolved

## Comments

- Implementado em `src/lib/scanner/engine.ts`: constantes `MAX_TERMS_PER_SCAN = 20`, `MAX_PRODUCTS_PER_TERM = 30` e `MAX_ELIGIBLE_PER_TERM = 10`; termos sem `slice(0,5)` e fallback completo (máx 20); contador por termo `savedInTerm` com interrupção do termo ao atingir 10; acumulador global `collectedProducts` (sem teto global, apenas relatório final); `existingIds.add(candidate.id)` após cada salvamento (dedupe entre termos); logs dinâmicos `[Termo i/N]` e progresso `X/10` por termo; mantidos o gate anti-bot, o fallback da API e a serialização de perfil. `spec.md` atualizado.

## Checklist

- [x] Termos: sem limite de 5 — usa todos os extraídos da home (máx 20) e completa com a lista completa de fallback (máx 20)
- [x] Coleta por termo: até 30 produtos analisados, salva TODOS os elegíveis até 10 por termo
- [x] Interrompe o termo ao atingir 10 elegíveis; avança ao próximo termo mesmo com termo anterior sem elegíveis
- [x] Sem teto global entre termos — cada termo pode contribuir com até 10
- [x] `existingIds` atualizado após cada salvamento para evitar duplicatas entre termos
- [x] Logs dinâmicos `[Termo i/N]` e progresso `X/10` por termo, com resumo final de produtos coletados
- [x] Mantém gate anti-bot, fallback da API (`api-search.ts`) e serialização de perfil (`browser-context.ts`)
- [x] Testes unitários verdes + `tsc --noEmit` limpo