# 08: TikTok + Download via ssstik Entram no Escopo (Docs)

**What to build:** O projeto passa a documentar a nova funcionalidade: para cada produto salvo no banco, o app busca um vídeo relevante no TikTok pelo nome do produto, baixa o vídeo em HD via ssstik.io e registra o arquivo no produto. O `spec.md` deixa de listar "Scraping/Download de vídeos do TikTok" como fora do escopo e ganha as user stories do fluxo de vídeo. Um ADR registra as decisões: Playwright com Chrome real, perfil persistente separado `.tiktok_profile` para o TikTok, busca por relevância (não pelo primeiro resultado), download via ssstik.io/pt, vídeos salvos em pasta privada (nunca no SQLite) e status `downloaded` sem alterar automaticamente o status do produto.

**Blocked by:** None (can start immediately)

**Status:** resolved

## Comments

- `spec.md`: TikTok removido de "Out of Scope"; Solution e grandes user stories novas (17-21) cobrindo busca relevante, download via ssstik, pipeline 1 clique, pasta privada + rota de API e `videoStatus` sem trocar o status do produto.
- `docs/adr/0001-tiktok-e-ssstik-download-de-video.md` criado com as decisões (real-Chrome, `.tiktok_profile` separado, relevância, ssstik via DOM, MP4 em disco privado, status `downloaded`).

- [ ] `spec.md`: tirar TikTok de "Out of Scope", adicionar user stories do fluxo vídeo e nota de que `published` não é setado automaticamente
- [ ] ADR registrando: perfil `.tiktok_profile` separado, real-Chrome, relevância no TikTok, ssstik.io como intermediário, pasta privada de vídeos + rota de acesso, status `downloaded`