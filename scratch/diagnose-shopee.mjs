import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileDir = process.env.SHOPEE_PROFILE_DIR
  ? path.resolve(process.env.SHOPEE_PROFILE_DIR)
  : path.resolve(__dirname, '..', '.shopee_profile');
const headful = process.argv.includes('--headful');
const termArg = process.argv.indexOf('--term');
const terms = termArg !== -1 ? [process.argv[termArg + 1]] : ['Arma de Gel', 'Projetor'];

async function diagnose() {
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  console.log(`Perfil: ${profileDir}`);
  console.log(`Modo: ${headful ? 'Visível (headful)' : 'Headless'}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headful,
    channel: 'chrome',
    viewport: { width: 1366, height: 768 },
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  for (const term of terms) {
    console.log(`\n=============== TERMO: "${term}" ===============`);
    const searchUrl = `https://shopee.com.br/search?keyword=${encodeURIComponent(
      term
    )}&sortBy=ctime`;
    console.log(`URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const waitProducts = async () => {
      try {
        await page.waitForSelector('.shopee-search-item-result__item', { timeout: 20000 });
        return true;
      } catch {
        return false;
      }
    };

    let itemsFound = await waitProducts();
    if (!itemsFound) {
      console.log('Cards não apareceram; recarregando página uma vez...');
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      itemsFound = await waitProducts();
    }

    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(2500);

    const dom = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const allAnchors = Array.from(document.querySelectorAll('a'));
      const hrefs = allAnchors.map((a) => a.href).filter(Boolean);

      const countMatches = (rx) => hrefs.filter((h) => rx.test(h)).length;

      const legacy = hrefs.filter((h) => /-i\.\d+\.\d+/.test(h.split('?')[0]));
      const productPath = hrefs.filter((h) => /\/product\/\d+\/\d+/.test(h.split('?')[0]));
      const queryParam = hrefs.filter((h) => /[?&]shopid=\d+/.test(h) && /[?&]itemid=\d+/.test(h));

      const containers = Array.from(
        document.querySelectorAll('.shopee-search-item-result__item')
      );
      const sqeLink = document.querySelectorAll('a[data-sqe="link"]').length;

      const firstContainer = containers[0]?.outerHTML?.slice(0, 2500) || null;

      const firstCard = document.querySelector(
        '.shopee-search-item-result__item a, .shopee-search-item-result__item'
      );

      // Tenta o endpoint interno de busca da Shopee (mesma origin, cookies da sessão)
      const apiUrl = `/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(
        document.querySelector('input[name="keyword"]')?.value || ''
      )}&limit=5&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;

      return {
        currentUrl: window.location.href,
        title: document.title,
        isBlocked: /verifica|robô|robot|captcha|bloqueado|acesso negado/i.test(bodyText.slice(0, 2000)),
        hasLoginWall: /fa?ça login|fazer login|entre na sua conta|entrar/i.test(bodyText.slice(0, 3000)),
        noResults: /nenhum resultado|não encontramos nenhum resultado|nenhum produto/i.test(bodyText.slice(0, 2000)),
        bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 300),
        totalAnchorLinks: hrefs.length,
        legacyISuffixCount: countMatches(/-i\.\d+\.\d+/),
        productPathCount: countMatches(/\/product\/\d+\/\d+/),
        queryParamCount: queryParam.length,
        legacySamples: legacy.slice(0, 3),
        productPathSamples: productPath.slice(0, 3),
        queryParamSamples: queryParam.slice(0, 3),
        itemContainerCount: containers.length,
        sqeLinkCount: sqeLink,
        firstContainerHtml: firstContainer,
        firstCardSample: firstCard ? (firstCard.outerHTML || '').slice(0, 2500) : null,
        cardDetails: containers.slice(0, 3).map((li) => {
          const text = (li.innerText || '').replace(/\s+/g, ' ').slice(0, 350);
          const priceCandidates = Array.from(li.querySelectorAll('*')).filter(
            (el) => /\bR\$\s?[\d.,]+/.test(el.textContent || '') && (el.children.length === 0)
          ).slice(0, 3).map((el) => ({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 80),
            txt: (el.textContent || '').trim().slice(0, 60),
          }));
          const salesCandidates = Array.from(li.querySelectorAll('*')).filter(
            (el) => /\d[\d.,]*\s*(?:mil|k)?\s*vendidos?/i.test(el.textContent || '') && (el.children.length === 0)
          ).slice(0, 3).map((el) => ({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 80),
            txt: (el.textContent || '').trim().slice(0, 60),
          }));
          const titleCandidates = Array.from(li.querySelectorAll('*')).filter(
            (el) => /^\s*\S.{8,}\S\s*$/.test(el.textContent || '') && (el.children.length === 0)
          ).slice(0, 3).map((el) => ({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 80),
            txt: (el.textContent || '').trim().slice(0, 80),
          }));
          const img = li.querySelector('img');
          return {
            innerText: text,
            imgSrc: img ? (img.getAttribute('src') || img.getAttribute('srcset') || '').slice(0, 140) : null,
            imgAlt: img ? (img.getAttribute('alt') || '').slice(0, 100) : null,
            priceCandidates,
            salesCandidates,
            titleCandidates,
          };
        }),

        salesSignalPresent: (() => {
          let found = 0;
          containers.forEach((li) => {
            Array.from(li.querySelectorAll('*')).forEach((el) => {
              if (el.children.length === 0 && /\bvendidos?\b/i.test(el.textContent || '')) found++;
            });
          });
          return found > 0;
        })(),
        soldLeaves: (() => {
          const sold = [];
          containers.forEach((li) => {
            Array.from(li.querySelectorAll('*')).forEach((el) => {
              if (el.children.length === 0 && /\bvendidos?\b/i.test(el.textContent || '')) {
                sold.push((el.textContent || '').trim().slice(0, 60));
              }
            });
          });
          return sold.slice(0, 8);
        })(),
        searchApiUrl: apiUrl,
      };
    });

    const jsonFile = path.join(__dirname, `diag-${term.replace(/\s+/g, '-')}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(dom, null, 2));
    console.log(`Diagnóstico salvo em ${jsonFile}`);
    console.log(JSON.stringify(dom, null, 2));

    // Tentativa de fetch interno à API após capturar o DOM
    try {
      const api = await page.evaluate(async (term) => {
        const url = `/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(
          term
        )}&limit=5&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
        const res = await fetch(url, { headers: { 'x-api-source': 'pc', 'if-none-match-': '' } });
        const ct = res.headers.get('content-type') || '';
        const text = await res.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text.slice(0, 20000));
        } catch {}
        const items = parsed?.data?.items || parsed?.items || [];
        return {
          status: res.status,
          contentType: ct,
          errorField: parsed?.error,
          itemCount: Array.isArray(items) ? items.length : 0,
          topLevelKeys: parsed?.data ? Object.keys(parsed.data).slice(0, 20) : (parsed ? Object.keys(parsed).slice(0, 20) : null),
          rawText: text.slice(0, 600),
          firstItem:
            items[0] || null,
        };
      }, term);
      console.log('\n-- Tentativa API /api/v4/search/search_items --');
      console.log(JSON.stringify(api, null, 2));
      const apiJsonFile = path.join(__dirname, `diag-api-${term.replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(apiJsonFile, JSON.stringify(api, null, 2));
    } catch (err) {
      console.log('\n-- Falha na tentativa API --');
      console.log(err.message);
    }
  }

  await context.close();
  console.log('\nDiagnóstico concluído.');
}

diagnose().catch((err) => {
  console.error(err);
  process.exit(1);
});