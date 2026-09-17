# 10: Motor de Busca de Vídeo Relevante no TikTok

**What to build:** Na interface de cada produto (status Pendente), surge um botão "Buscar vídeo". Ao clicá-lo, o app abre o TikTok no navegador (Chrome real, perfil persistente separado `.tiktok_profile`, login/desafio manual permitido 1x com sessão persistida), pesquisa pelo título do produto, identifica o primeiro vídeo RELEVANTE (não simplesmente o primeiro resultado) e guarda a URL no produto com `videoStatus="searched"`. Todo avanço é reportado nos logs SSE.

**Blocked by:** 09

**Status:** resolved

## Comments

- `src/lib/scanner/tiktok-relevance.ts`: núcleo puro (normalização de acentos/caixa, branching por token, penalidade de legenda trivial, rankeamento do melhor vídeo). 14 testes sem rede.
- `src/lib/scanner/tiktok-search.ts`: busca real no TikTok (`channel: 'chrome'`, perfil persistente `.tiktok_profile` separado da Shopee), coleta de cards via DOM, scroll humano, detecção de login-wall/verificação com mensagem acionável, guarda de concorrência (`getVideoProcessing`), `openTikTokSession()` para login manual 1x em janela visível, logs SSE em cada etapa.
- `src/app/api/tiktok/session/route.ts`: abre navegador visível persistente para autenticar no TikTok.
- `src/app/api/video/search/route.ts`: dispara a busca pelo termo do produto e salva `tikTokUrl` + `videoStatus="searched"` no banco.
- UI: botão "Buscar vídeo no TikTok" no card (vira link "Ver vídeo" quando há `tikTokUrl`), spinner `videoSearchingId`, botão "Login TikTok" na barra de ações, todos com feedback nos logs SSE.
- Suíte: 51 testes verdes (14 novos do ranqueador), `tsc --noEmit` limpo.
- Aceite E2E real exige HITL 1x: clicar "Login TikTok", autenticar/resolver verificação na janela visível, e testar a busca de um produto. Pode precisar ajuste de seletor se o TikTok mudar de layout.

- [ ] Módulo de busca TikTok: navega para o TikTok, pesquisa pelo termo, coleta vídeos da busca
- [ ] Ranqueia por relevância (correspondência do termo no título/legenda/hashtags; penalizar vídeos triviais ou fora do tema) e escolhe o 1º realmente relevante
- [ ] Perfil persistente separado `.tiktok_profile` (não reusa cookies da Shopee), com sessão salva entre execuções e suporte a desafio de login manual 1x via janela visível
- [ ] Route de API que dispara a busca para um produto e salva `tikTokUrl` + `videoStatus="searched"`
- [ ] Botão "Buscar vídeo" no card do produto + feedback de progresso/erro na UI
- [ ] Logs SSE em cada etapa (abrir TikTok, pesquisar termo, avaliar relevância, vídeo escolhido, erro)
- [ ] Testes unitários do ranqueador/parser com fixtures de DOM do TikTok (sem rede), mesma filosofia do scraper Shopee
- [ ] Aceite E2E pode exigir HITL 1x (login/resolução) e varia conforme anti-bot do TikTok