# Spec: Shopee Video Opportunity Finder (MVP)

Status: ready-for-agent

## Problem Statement

As a Shopee affiliate seeking to publish high-converting content on Shopee Video, finding trending products with early traction is currently a tedious, manual process. Navigating to "Buscas em alta", searching each term, sorting by newest, checking sales counts one by one, and verifying whether an item has already been worked on wastes valuable time and slows down daily video production.

## Solution

An automated local web application that monitors Shopee's trending searches, analyzes the newest products, automatically selects the first fresh product with at least 5 sales, and records its details (image, title, price, sales count, and link) in an intuitive management dashboard. The user can easily open a browser for one-time login verification, trigger scans on demand, watch real-time scan logs via Server-Sent Events, and update the status of each opportunity (Pending, Video Published, Discarded).

## User Stories

1. As a Shopee affiliate, I want to click a single "Iniciar Varredura" button so that the system automatically hunts for a fresh product opportunity without manual searching.
2. As a Shopee affiliate, I want the system to extract trending terms from Shopee's "Buscas em alta" so that my product choices align with what buyers are actively searching for.
3. As a Shopee affiliate, I want the system to order search results by "Mais recente" so that I discover newly trending products early before the market gets saturated.
4. As a Shopee affiliate, I want the system to inspect up to 30 products per search term so that only reasonably visible products are considered.
5. As a Shopee affiliate, I want the system to select only products with at least 5 sales so that I have proof of validation and buyer interest.
6. As a Shopee affiliate, I want the system to skip products that already exist in my database so that I never waste time evaluating or publishing the same product twice.
7. As a Shopee affiliate, I want the scanner to automatically cascade to the next trending search term if the current term has no eligible unworked products so that the scan completes with a concrete result whenever possible.
8. As a Shopee affiliate, I want the scan to stop immediately after finding the first eligible product so that the process is fast and focused.
9. As a Shopee affiliate, I want to view live scan progress logs in real time via Server-Sent Events so that I know exactly what the robot is doing and can spot any issues.
10. As a Shopee affiliate, I want to open a visible browser window via a "Login Shopee" button so that I can authenticate or solve bot-check challenges once and save cookies persistently.
11. As a Shopee affiliate, I want the scanner to run headlessly in the background during normal operations so that my computer screen is not disturbed.
12. As a Shopee affiliate, I want to see a clean dashboard with product cards containing image thumbnails, titles, prices, sales counts, and origin search terms so that I can quickly evaluate the opportunity.
13. As a Shopee affiliate, I want a direct link button to open the product page on Shopee so that I can inspect the product or generate my affiliate link.
14. As a Shopee affiliate, I want to update the status of each product between "Pendente", "Vídeo Publicado", and "Descartado" so that my content pipeline remains organized.
15. As a Shopee affiliate, I want all data stored in a lightweight local SQLite database so that my setup requires no cloud services or external databases.

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
- Scraping or downloading TikTok videos (deferred to Phase 2).
- Automated uploading or posting of videos to Shopee Video.
- Multi-user authentication or cloud multi-tenant deployment.
- Mobile application.

## Further Notes
- The `.shopee_profile/` directory holds active cookies and session storage and must never be committed to source control.
- Realistic human-like delays and user-agent headers in Playwright will minimize bot detection.
