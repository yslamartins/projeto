# Spec: Shopee Video Opportunity Finder (MVP)

Status: ready-for-agent

## Problem Statement

As a Shopee affiliate seeking to publish high-converting content on Shopee Video, finding trending products with early traction is currently a tedious, manual process. Navigating to "Buscas em alta", searching each term, sorting by newest, checking sales counts one by one, and verifying whether an item has already been worked on wastes valuable time and slows down daily video production.

## Solution

An automated local web application that monitors Shopee's trending searches, analyzes the newest products, automatically selects up to 10 fresh products per search term (products with at least 5 sales, prioritizing quantity per term), and records their details (image, title, price, sales count, and link) in an intuitive management dashboard. For each opportunity, the app can also find a relevant TikTok video by product name and download it in HD via TikDrop, storing references in the database and the MP4 in a private folder. The user can easily open a browser for one-time login verification, trigger scans on demand, watch real-time scan logs via Server-Sent Events, run the video pipeline, and update the status of each opportunity (Pending, Video Published, Discarded).

## User Stories

1. As a Shopee affiliate, I want to click a single "Iniciar Varredura" button so that the system automatically hunts for up to 10 fresh product opportunities per trending search term without manual searching.
2. As a Shopee affiliate, I want the system to extract trending terms from Shopee's "Buscas em alta" so that my product choices align with what buyers are actively searching for.
3. As a Shopee affiliate, I want the system to order search results by "Mais recente" so that I discover newly trending products early before the market gets saturated.
4. As a Shopee affiliate, I want the system to inspect up to 30 products per search term so that only reasonably visible products are considered.
5. As a Shopee affiliate, I want the system to select only products with at least 5 sales so that I have proof of validation and buyer interest.
6. As a Shopee affiliate, I want the system to skip products that already exist in my database so that I never waste time evaluating or publishing the same product twice.
7. As a Shopee affiliate, I want the scanner to process each trending search term's candidates and only then cascade to the next term so that quantity of eligible products per term is prioritized.
8. As a Shopee affiliate, I want the scan to save ALL eligible unworked products (sales >= 5) found among up to 30 products analyzed per trending term, up to a total of 10 products per term, so that I maximize the number of fresh opportunities captured from each term. After finishing a term (or reaching its 10-item limit), the scan continues to the next term.
9. As a Shopee affiliate, I want the scan to consider at most 20 trending terms per run so that an execution does not become excessively long.
10. As a Shopee affiliate, I want to view live scan progress logs in real time via Server-Sent Events so that I know exactly what the robot is doing and can spot any issues.
11. As a Shopee affiliate, I want to open a visible browser window via a "Login Shopee" button so that I can authenticate or solve bot-check challenges once and save cookies persistently.
12. As a Shopee affiliate, I want the scanner to run headlessly in the background during normal operations so that my computer screen is not disturbed.
13. As a Shopee affiliate, I want to see a clean dashboard with product cards containing image thumbnails, titles, prices, sales counts, and origin search terms so that I can quickly evaluate the opportunity.
14. As a Shopee affiliate, I want a direct link button to open the product page on Shopee so that I can inspect the product or generate my affiliate link.
15. As a Shopee affiliate, I want to update the status of each product between "Pendente", "Vídeo Publicado", and "Descartado" so that my content pipeline remains organized.
16. As a Shopee affiliate, I want all data stored in a lightweight local SQLite database so that my setup requires no cloud services or external databases.
17. As a Shopee affiliate, I want the system to search TikTok for the product's name and pick the FIRST RELEVANT video (not the first result) so that the video actually matches the product.
18. As a Shopee affiliate, I want the system to download the chosen TikTok video in HD via TikDrop (API HTTP, sem marca d'água, sem navegador) and register the local file and links in the product, so that I have the video ready to use.
19. As a Shopee affiliate, I want a one-click "Buscar e Baixar Vídeo" pipeline that chains search and download, reporting every step via SSE, so that I don't have to run the flows one by one.
20. As a Shopee affiliate, I want the video file stored in a private folder (references only in the database, never the binary) and served through an API route, so that videos aren't exposed as public static files.
21. As a Shopee affiliate, I want completing a download to set `videoStatus="downloaded"` WITHOUT automatically changing the product status, so that I keep control over when an item is published.

## Implementation Decisions

### Architectural Structure
- Unified Next.js application (App Router, TypeScript) containing frontend dashboard, API routes, and Playwright automation routines.
- Playwright Chromium engine configured with persistent browser context stored under `.shopee_profile/` (gitignored).

### Scanner Engine Module
- Modular scraper service responsible for:
  - Launching the persistent browser context in headless (default) or headful mode.
  - Navigating to Shopee's trending search sections.
  - Parsing the search results page sorted by newest.
  - Extracting product cards: title, product URL/ID, price, sales count, image URL.
  - Applying qualification rules (`salesCount >= 5 && !db.hasProduct(id)`).
  - Collecting up to 10 eligible products per trending term (inspecting up to 30 products per term, saving all eligible candidates per term before moving on to the next term).
  - Emitting structured log events to a shared event stream.

### Real-Time Log Streaming
- Server-Sent Events (SSE) route `/api/scanner/logs` streaming log lines to the client.
- Trigger route `/api/scanner/start` to kick off the scanning job.
- Session route `/api/scanner/session` to launch the browser in headful mode for login.

### Data Layer
- SQLite database stored locally via Prisma ORM with table `Product`:
  - `id`: Text (primary key, extracted Shopee product ID / hash)
  - `title`: Text
  - `price`: Text
  - `salesCount`: Integer
  - `imageUrl`: Text
  - `productUrl`: Text
  - `searchTerm`: Text
  - `status`: Text (`pending`, `published`, `discarded`)
  - `createdAt`: DateTime
  - `updatedAt`: DateTime

### Frontend UI
- Modern dashboard with Tailwind CSS.
- Top control bar: "Iniciar Varredura", "Abrir Navegador para Login", toggle para "Modo Visível".
- Collapsible real-time log terminal drawer.
- Product grid with cards showing image, price, sales badge, status selector, and external link buttons.
- Filter tabs: "Todos", "Pendentes", "Publicados", "Descartados".

## Testing Decisions
- Testing should prioritize external behavior rather than internal scraping implementation details.
- Primary testing seams:
  - Scraper parsing & qualification logic: tested against HTML fixtures of Shopee search results (verifying sales numbers, prices, and deduplication without hitting live Shopee network during automated unit tests).
  - Database repository seam: tests verifying CRUD operations, duplication exclusion, and status transitions on test SQLite database.
  - API route seam: testing start/status/list endpoints with mock scanner responses.

## Out of Scope
- Automated uploading or posting of videos to Shopee Video (deferred).
- Multi-user authentication or cloud multi-tenant deployment.
- Mobile application.

## Further Notes
- The `.shopee_profile/` (Shopee) and `.tiktok_profile/` (TikTok) directories hold active cookies and session storage and must never be committed to source control.
- The `.videos/` directory holds downloaded MP4 files (private, served via API route) and must never be committed to source control.
- `videoStatus` transitions: `none -> searched -> downloaded` (or `failed`). Downloads never change the product's own status.
- Realistic human-like delays and Chrome real channel in Playwright will minimize bot detection.
