# ADR 0001: Fluxo de Vídeo TikTok + Automação de Página (Scrapling)

Data: 2026-09-14
Status: Accepted. Download via ssstik substituído pelo ADR 0002 (TikDrop). Automação de página migrada de Playwright para Scrapling (tickets do `scrapling-migration`).

## Context

O MVP coleta oportunidades de produto na Shopee (título, preço, vendas, imagem, link) e as salva no banco local. Para acelerar a produção de vídeos do Shopee Video, queremos, a partir do nome de um produto salvo, encontrar um vídeo relevante no TikTok e baixá-lo em HD para uso. A varredura da Shopee e a busca no TikTok são automações de página expostas a anti-bots (gate `verify`/captcha, erro `90309999` na API interna, login-wall). O Playwright (Chrome real via CDP, stealth e humanização manuais) mostrou-se frágil contra esse anti-bot e exigia manutenção contínua de seletores.

## Decision

- **Scrapling como motor de automação de página** para a varredura (Shopee e TikTok): os drivers rodam como subprocesso Python (`tools/scrapling/collect.py`), acionados pelo Node via `spawn` com contrato JSONL (logs → SSE + linha final `result`). Fica para trás o caminho Playwright (lançador de Chrome gerenciado, stealth, humanização, contexto ativo) — removido por completo.
- **Orquestração permanece em Node/Next.js**: termos (máx 20), limites (30/10), dedup, elegibilidade, upsert no Prisma e SSE continuam no engine.
- **Perfil persistente separado `.tiktok_profile`** para o TikTok, e `.shopee_profile` para a Shopee: permite login/desafio manual 1x com sessão persistida (HITL).
- **Busca por relevância, não pelo 1º resultado**: ranquear vídeos da busca pelo quanto o título/legenda/hashtags correspondem ao termo do produto (ranqueador em Node, intocado).
- **ssstik → Substituto:** o download é intermediado pela **API TikDrop** (ver ADR 0002) — sem navegador nessa etapa.
- **MP4 fica em disco, pasta privada** (fora de `public/`); o SQLite guarda apenas `tikTokUrl`, `videoUrl`, `videoPath` e `videoStatus`. Entrega do arquivo por rota de API, não por `public/`.
- **`videoStatus`**: `none | searched | downloaded | failed`. Concluir o download **não** altera o status do produto (`pending/published/discarded`); publicação continua sendo decisão manual do usuário.
- **SSE em todas as etapas** dos fluxos de varredura, busca e download, para acompanhamento em tempo real.

## Consequences

- Requer HITL eventual (login/anti-bot no TikTok e na Shopee), como já acontecia.
- Automações de página vivem agora em Python (Scrapling), testadas com fixtures HTML offline; no Node sobram apenas parsing de cards, elegibilidade e orquestração.
- A varredura e o login rodam como subprocesso isolado: a memória do navegador fica fora do processo do servidor.
- Assincronismo: varredura/busca/download rodam em background e reportam via `scannerEvents`.