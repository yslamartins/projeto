# 04: Disparo da Varredura com Logs em Tempo Real (SSE) e Conexão E2E

**What to build:** An interactive "Iniciar Varredura" button in the dashboard connected to Server-Sent Events `/api/scanner/logs`, streaming real-time status and scraper steps directly into a collapsible terminal drawer in the UI, and automatically updating the product list when the scan successfully finishes.

**Blocked by:** 03-shopee-scraper-engine

**Status:** resolved

- [x] SSE endpoint `/api/scanner/logs` streaming live progress events from the scanner
- [x] Endpoint `/api/scanner/start` accepting scan requests (with headless/headful option)
- [x] UI button "Iniciar Varredura" with loading/scanning indicators
- [x] Terminal drawer in UI displaying formatted, color-coded live logs
- [x] Auto-refresh of products list upon scan completion
- [x] End-to-end flow verified
