# 02: Infraestrutura Playwright e Lançador de Sessão/Login Shopee

**What to build:** Playwright automation setup configured with persistent browser profile in `.shopee_profile/` and a dedicated "Abrir Navegador para Login" button in the dashboard that launches Chromium in headful (visible) mode so the user can log in or solve human verifications.

**Blocked by:** 01-scaffold-db-and-dashboard

**Status:** resolved

- [x] Playwright configured with persistent browser context directory `.shopee_profile/` (added to `.gitignore`)
- [x] API endpoint `/api/scanner/session` to launch the browser in visible mode
- [x] Dashboard button "Abrir Navegador para Login" that triggers the session launcher and reports status to the user
- [x] Cookies and storage state saved reliably across runs
