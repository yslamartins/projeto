# 06: Revalidação E2E Contra o Shopee BR Real

**What to build:** Revalida o scanner contra o Shopee Brasil real após a extração tolerante a formatos: atualiza o diagnóstico (contagem de links por formato + amostra do DOM), ajusta os seletores in-page ao markup atual da página de busca e, somente se necessário, cai para o JSON interno `/api/v4/search/search_items`. Ao final, uma varredura completa encontra >= 1 produto elegível e o salva no dashboard.

**Blocked by:** 05-extracao-de-produtos-tolerante-aos-dois-formatos-de-url

**Status:** ready-for-human

## Comments

### Sessão de diagnóstico (14/09)

- `scratch/diagnose-shopee.ts` substituído por `scratch/diagnose-shopee.mjs` (executável com `node`, suporta `--term` e `--headful`). Reporta contagem de links por formato (`-i.`, `/product/`, `?shopid&itemid`), amostra do DOM, `isBlocked`, detecção do gate anti-bot, detalhes de preço/vendas/título/imagem dos cards e uma tentativa contra `/api/v4/search/search_items`.
- **Achado principal — o gargalo real é o anti-bot, não o parser:** "Arma de Gel" e até "Projetor" são redirecionados a `/verify/captcha?...&scene=crawler_item` ou `/verify/traffic` ("Verifique para continuar" / slider). Quando a requisição passa, o DOM atual rende **60 cards** (`.shopee-search-item-result__item`, atributo mudou de `data-sqe="link"` para `data-sqe="item"`; hrefs continuam `-i.`). O serializer real é a verificação de segurança.
- **API interna:** `/api/v4/search/search_items` responde `error: 90309999` (anti-bot) quando bloqueado; sem sessão confiável não é uma rota de fuga confiável. Ficou como fallback DOM-primeiro apenas.

### Implementado (enquanto isso)

- [x] `scratch/diagnose-shopee.mjs` reporta contagem de links por formato e amostra do DOM (isBlocked, títulos, hrefs)
- [x] Seletores da página de busca ajustados/endurecidos no `engine.ts` (espera determinística `waitForSelector` + 1 reload; detecção do gate anti-bot aborta a varredura com mensagem acionável em vez de reportar "0 produtos"; extração de título via `aria-label="Product card: ..."`/`img[alt]`/classes; preço via text scan quando o seletor não casa; imagens lazy-load)
- [x] Fallback para JSON interno (`api-search.ts`: `fetchSearchItems` + `mapApiItemToRawCard`) implementado e disparado **somente** quando o DOM retorna 0 cards e a página não está no gate
- [x] Anti-bot/captcha detectado e reportado de forma clara (`SECURITY_GATE_MESSAGE`) — inclusive `error 90309999` da API vira a mesma mensagem acionável
- [x] Testes unitários: 33/33 verdes (inclui `api-search.test.ts`) e `tsc --noEmit` limpo

### Pendência E2E (manual — requer humano)

- [ ] **Login/verificação falsa** — clicar "Login Shopee" (agora visível, `session.ts` com `headless: false`), resolver o slider/captcha uma vez e entrar/logar; depois rodar uma varredura (sugerido: "Arma de Gel") com "Modo Visível" e confirmar nos logs `N produtos carregados para inspeção` e `🎯 Produto elegível encontrado` + card salvo no dashboard.

**Nota de arquitetura:** o perfil `.shopee_profile/` agora é serializado via `src/lib/scanner/browser-context.ts` (sessão de login e varredura não disputam o mesmo user-data-dir; o erro "Target page, context or browser has been closed" de instâncias concorrentes foi eliminado).