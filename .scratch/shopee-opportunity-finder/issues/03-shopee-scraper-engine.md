# 03: Mecanismo de Coleta (Buscas em alta, Ordenação e Filtro >= 5 vendas)

**What to build:** Core Shopee scraping module that extracts up to 5 terms from "Buscas em alta", searches each sorted by "Mais recente", examines up to 30 products per term, skips any products already present in the database, and extracts the first fresh product with at least 5 sales, immediately stopping upon discovery and saving to database.

**Blocked by:** 02-playwright-session-launcher

**Status:** resolved

- [x] Scraper logic to extract trending search terms from Shopee
- [x] Scraper logic to navigate to search results sorted by newest
- [x] Extraction of product card details (title, price, sales count, image, URL)
- [x] Product filtering rule: sales count >= 5 and not in database
- [x] Automatic fallback across up to 5 terms if current term has no fresh eligible products
- [x] Unit tests for scraper parsing and qualification logic with fixtures
