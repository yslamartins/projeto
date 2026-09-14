# 09: Data Layer de Vídeo no Product

**What to build:** O registro de produto passa a armazenar os dados do vídeo associado: URL do vídeo no TikTok, URL/path do arquivo baixado e o status do download. O banco guarda apenas referências (`videoUrl`, `videoPath`, `tikTokUrl`, `videoStatus`); o arquivo MP4 em si nunca é salvo no SQLite, ficando em disco. Nada de chamada existente quebra (campos nullable).

**Blocked by:** None (can start immediately)

**Status:** resolved

## Comments

- `prisma/schema.prisma`: `Product` ganhou `tikTokUrl`/`videoUrl`/`videoPath` (String?) e `videoStatus` (String, default `none`). Banco sincronizado via `prisma db push` (sem histórico de migrations no projeto; `migrate reset` apagaria dados). Client regenerado.
- `src/types/product.ts`: `VideoStatus` (`none|searched|downloaded|failed`) e `Product` com os campos novos.
- Rotas: GET/POST `/api/products` e PATCH `/api/products/[id]` persistem os campos; PATCH valida `videoStatus` e aceita atualizações parciais.
- `src/lib/products/product-crud.test.ts`: DB SQLite temporário isolado (tmp + `prisma db push`) com 4 testes cobrindo default/omissão, persistência na criação, transição `searched -> downloaded` e não-alteração do status do produto.
- `.gitignore`: `.tiktok_profile/` e `.videos/` adicionados.

- [ ] Colunas novas nullable no `Product`: `tikTokUrl` (String?), `videoUrl` (String?), `videoPath` (String?), `videoStatus` (String, default `none`)
- [ ] Valores de `videoStatus`: `none` | `searched` | `downloaded` | `failed`
- [ ] Tipos TS (`Product`) com os novos campos
- [ ] Rotas GET/POST `/api/products` e PATCH `/api/products/[id]` persistem e devolvem os novos campos
- [ ] Migration aplicada e seed compila
- [ ] Teste unitário de CRUD cobrindo os novos campos (incluindo `videoStatus` default e transição `searched -> downloaded`)