# ADR 0001: Fluxo de Vídeo TikTok + Download via ssstik

Data: 2026-09-14
Status: Accepted. Download via ssstik substituído pelo ADR 0002 (TikDrop).

## Context

O MVP coleta oportunidades de produto na Shopee (título, preço, vendas, imagem, link) e as salva no banco local. Para acelerar a produção de vídeos do Shopee Video, queremos, a partir do nome de um produto salvo, encontrar um vídeo relevante no TikTok e baixá-lo em HD para uso.

## Decision

- **Playwright com Chrome real** (`channel: 'chrome'`) em todos os fluxos de automação, sem o Chromium de automação e sem `--no-sandbox`.
- **Perfil persistente separado `.tiktok_profile`** para o TikTok, para não misturar cookies com o perfil da Shopee (`.shopee_profile`). Permite login/desafio manual 1x com sessão persistida (HITL).
- **Busca por relevância, não pelo 1º resultado**: ranquear vídeos da busca pelo quanto o título/legenda/hashtags correspondem ao termo do produto.
- **ssstik.io/pt como intermediário de download**: colar a URL do TikTok, baixar em HD, atravessar o intersticial/anúncio e capturar o link HD.
- **MP4 fica em disco, pasta privada** (fora de `public/`); o SQLite guarda apenas `tikTokUrl`, `videoUrl`, `videoPath` e `videoStatus`. Entrega do arquivo por rota de API, não por `public/`.
- **`videoStatus`**: `none | searched | downloaded | failed`. Concluir o download **não** altera o status do produto (`pending/published/discarded`); publicação continua sendo decisão manual do usuário.
- **SSE em todas as etapas** dos fluxos de busca e download, para acompanhamento em tempo real.

## Consequences

- Requer HITL eventual (login/anti-bot no TikTok e no ssstik), como já acontece na Shopee.
- Automações via DOM são frágeis a mudanças de layout; sofismar com testes de fixture por módulo (mesma filosofia do scraper Shopee).
- Assincronismo: a busca/download roda em background e reporta via `scannerEvents`.