# Spec: Migrar a varredura (Shopee + TikTok) de Playwright para Scrapling

Status: ready-for-agent

## Problem Statement

A varredura da Shopee (termos em alta, página de busca, extração de cards, fallback por API interna) e a busca de vídeos no TikTok são hoje feitas com Playwright (Chrome real via CDP, script de stealth, humanização manual de mouse/scroll). O Playwright é frágil contra o anti-bot da Shopee BR (gates `verify`/captcha e o erro `90309999` da API interna), exige manutenção de seletores e adiciona uma dependência de navegador ao servidor Next.js. O objetivo é trocar o navegador de automação dos dois sites por **Scrapling** (biblioteca Python com stealth contra anti-bots, seletores adaptativos e sessões persistentes), mantendo toda a orquestração, qualificação e persistência em Node.

## Solution

- Dois processos: o **Node/Next.js continua orquestrando** a varredura (termos, limites 20/30/10, dedup, elegibilidade, upsert no Prisma, SSE) e os **drivers de página migram para Python**, acionados como subprocesso via CLI (`spawn`), com contrato de saída JSONL (logs por linha + linha final de resultado).
- O driver **Shopee** cobre: "Buscas em alta", página de busca ordenada por "Mais recente", extração de `RawCardData`, fallback/enriquecimento pela API interna (`/api/v4/search/search_items`, erro `90309999` → gate), detecção de gates/verify/captcha, e sessão headful de login com perfil persistente.
- O driver **TikTok** cobre: sessão headful de login persistente e busca de vídeos (`/search?q=`), com detecção de login-wall.
- O **Playwright sai da varredura por completo** (Shopee e TikTok): módulos dedicados a ele (`chrome-launcher`, `stealth`, `humanize`, sessão/perfil da Shopee, `browser-context`) são removidos ao fim, e a dependência `playwright` é removida do `package.json`. Baixar vídeo continua via TikDrop (HTTP, sem navegador) — inalterado.
- O ranqueador de relevância do TikTok, o pipeline de download e a camada de dados ficam intocados.

## Contrato CLI entre Node e Python (decidido na fundação)

- `python collect.py <site> <acao>` (ex.: `collect shopee search --term "projetor"`, `collect shopee terms`, `collect shopee session --headful`, `collect tiktok search --q "fone bluetooth"`, `collect tiktok session`).
- Saída no **stdout em JSONL**:
  - `{"t":"log","level":"info|step|warn|error|success","message":"..."}` (repassado ao SSE);
  - linha final `{"t":"result","ok":true,"data":{...}}` (ou `ok:false` com `error`).
- O `data` do driver Shopee usa o mesmo formato `RawCardData` já consumido pelo Node.
- Perfis persistidos por site em diretório local não commitado; comandos `session` aguardam a ação humana e fecham a linha de resultado ao sair.

## Tracer bullets (ordem de dependência)

1. **01** — Fundação: ambiente Python + Scrapling + protocolo CLI (spike de viabilidade contra Shopee e TikTok reais)
1. **02** — Driver Shopee: "Buscas em alta" + coleta de cards por termo (`RawCardData[]` + gates) — bloqueado por 01
1. **03** — Driver Shopee: enriquecimento de vendas pela API interna + erro `90309999` — bloqueado por 02
1. **04** — Integrar Shopee no engine Node (`spawn collect`) ponta-a-ponta com SSE — bloqueado por 03
1. **05** — Login Shopee headful + perfil persistente via Scrapling — bloqueado por 01
1. **06** — Driver TikTok: sessão headful + busca de vídeos — bloqueado por 01
1. **07** — Integrar TikTok no Node (`spawn collect`) — bloqueado por 06
1. **08** — Contrato: remover o caminho Playwright da varredura (expand–contract) — bloqueado por 04, 05, 07
1. **09** — Remover `playwright` do `package.json` + atualizar ADR 0001 e spec — bloqueado por 08

## Out of Scope

- Trocar o download de vídeo (continua via TikDrop, HTTP).
- Tocar o ranqueador de relevância do TikTok, o pipeline de pipeline/download ou a camada de dados.
- Online/cloud deployment; continua app local.

## Notas

- A varredura e o login rodam como subprocesso Python: memória do navegador isolada do servidor.
- Gate anti-bot e erros da Shopee continuam sendo reportados em PT-BR ao terminal SSE, como hoje.
- Os diretórios de perfil (`shopee`, `tiktok`) continuam fora do versionamento.