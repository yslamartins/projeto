import { BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { scannerEvents } from './events';
import {
  parseSalesCount,
  extractShopeeProductId,
  normalizeShopeeUrl,
  formatPrice,
  isProductEligible,
} from './parser';
import { parseProductCard, RawCardData } from './product-card-parser';
import {
  fetchSearchItems,
  mapApiItemToRawCard,
  buildApiSalesMap,
  enrichRawCardsWithApiSales,
} from './api-search';
import { closeActiveContext, getActiveContext, setActiveContext } from './browser-context';
import { launchManagedChrome } from './chrome-launcher';
import { installAntiDetect } from './stealth';
import { humanDelay, humanScroll, humanMouseIdle, resetCursor } from './humanize';

const PROFILE_DIR = path.resolve(process.cwd(), '.shopee_profile');

const MAX_TERMS_PER_SCAN = 20;
const MAX_PRODUCTS_PER_TERM = 30;
const MAX_ELIGIBLE_PER_TERM = 10;

const SECURITY_GATE_MESSAGE =
  'Shopee exibiu verificação de segurança (anti-bot) e bloqueou esta varredura. Resolva o desafio/slider uma única vez no navegador visível clicando em "Login Shopee", e rode a varredura novamente (de preferência com "Modo Visível" ativado).';

const LOGIN_WALL_MESSAGE =
  'Shopee exigiu o login para pesquisar este termo (alguns termos, como produtos para adultos, só aparecem para contas autenticadas). Clique em "Login Shopee", faça login/resolva a verificação uma vez, e rode a varredura novamente.';

const TEMPORARY_BLOCK_MESSAGE =
  'Shopee bloqueou temporariamente a varredura ("A verificação falhou / Tente novamente mais tarde"). Aguarde alguns minutos antes de tentar de novo; tentativas em sequência rápida reforçam o bloqueio.';

async function isSecurityGate(page: Page): Promise<boolean> {
  if (page.url().includes('/verify/')) return true;
  try {
    const text = (await page.locator('body').innerText({ timeout: 4000 })) || '';
    return /verifique para continuar|quebra-cabeça|captcha|verificação de segurança/i.test(
      text.slice(0, 2000)
    );
  } catch {
    return false;
  }
}

async function isLoginWall(page: Page): Promise<boolean> {
  if (/\/buyer\/login(\/|$)/.test(page.url())) return true;
  try {
    const text = (await page.locator('body').innerText({ timeout: 4000 })) || '';
    return /faça login com senha|fazer login|mantenha-se conectado|stay signed in/i.test(
      text.slice(0, 3000)
    );
  } catch {
    return false;
  }
}

async function isTemporaryRateLimit(page: Page): Promise<boolean> {
  if (page.url().includes('/verify/')) return false;
  try {
    const text = (await page.locator('body').innerText({ timeout: 4000 })) || '';
    return /tente novamente mais tarde|a verifica[çc][ãa]o falhou|tente novamente em alguns minutos/i.test(
      text.slice(0, 2000)
    );
  } catch {
    return false;
  }
}

async function maybeBlockMessage(page: Page): Promise<string | null> {
  if (await isTemporaryRateLimit(page)) return TEMPORARY_BLOCK_MESSAGE;
  if (await isSecurityGate(page)) return SECURITY_GATE_MESSAGE;
  if (await isLoginWall(page)) return LOGIN_WALL_MESSAGE;
  return null;
}

async function waitForSearchResults(page: Page, timeout = 12000): Promise<boolean> {
  try {
    await page.waitForSelector('.shopee-search-item-result__item', { timeout });
    return true;
  } catch {
    return false;
  }
}

// Termos em alta reais extraídos da seção "Buscas em alta" da Shopee
export const REAL_SHOPEE_TRENDING_TERMS = [
  'Projetor',
  'Mouse Sem Fio',
  'Capa de Chuva Moto',
  'Rasteirinha',
  'Lembrancinha Professores',
  'Biquíni',
  'Kit Calcinha Algodao',
  'Bebê Reborn',
  'PC Gamer',
  'Playstation 5',
  'Panela Mexedeira de Massa Salgado',
  'Pião Fever Profissional',
  'Óculos de Sol Oakley Bluetooth',
  'Lego',
  'Sofá',
  'Vibrador',
  'Pele de Bumbo',
  'Bloqueador de Sinal Bluetooth',
];

interface ScannerOptions {
  headful?: boolean;
  term?: string;
}

export async function runShopeeScanner(options: ScannerOptions = {}): Promise<{
  success: boolean;
  product?: any;
  error?: string;
}> {
  if (scannerEvents.getIsScanning()) {
    return { success: false, error: 'Uma varredura já está em andamento.' };
  }

  scannerEvents.setIsScanning(true);
  scannerEvents.emit('step', 'Iniciando robô de varredura da Shopee...');

  let context: BrowserContext | null = null;

  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }

    // 1. Carregar produtos já existentes para evitar duplicatas
    const existingProducts = await prisma.product.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.id));
    scannerEvents.emit(
      'info',
      `Base de dados carregada: ${existingIds.size} produtos já conhecidos serão ignorados.`
    );

    // 2. Iniciar navegador Playwright com perfil persistente
    const isHeadless = !options.headful;
    scannerEvents.emit(
      'info',
      `Abrindo Chromium (${isHeadless ? 'Headless/Invisível' : 'Modo Visível'})...`
    );

    // Libera o perfil persistente caso haja um navegador de sessão/login aberto
    if (getActiveContext()) {
      scannerEvents.emit(
        'info',
        'Fechando navegador de sessão aberto para liberar o perfil persistente...'
      );
      await closeActiveContext();
    }

    const managed = await launchManagedChrome({
      userDataDir: PROFILE_DIR,
      headless: isHeadless,
    });
    context = managed.context;
    setActiveContext(context, managed.dispose);

    // Anti-detecção antes de qualquer navegação (webdriver, plugins, WebGL...)
    await installAntiDetect(context);

    const pages = context.pages();
    const page: Page = pages.length > 0 ? pages[0] : await context.newPage();

    // Observa o console da página: telemetria interna da Shopee (APMS) e
    // erros do bundle JS (modules-federation) são ruído que sempre contém
    // palavras como "captcha" e não indicam bloqueio real. Só mensagens fora
    // desse ruído com captcha/verificação/bloqueio viram aviso acionável.
    const seenConsoleSignals = new Set<string>();
    page.on('console', (msg) => {
      const text = msg.text().trim();
      if (!text) return;
      if (/\[APMS\]|^Error at /.test(text)) return;
      if (/captcha|verifica|bloque|robô|robot|anti-?bot/i.test(text)) {
        const key = text.slice(0, 80);
        if (seenConsoleSignals.has(key)) return;
        seenConsoleSignals.add(key);
        scannerEvents.emit(
          'warn',
          `Shopee (console): ${text.slice(0, 160)}`
        );
      }
    });

    // 3. Obter termos de "Buscas em alta"
    let trendingTerms: string[] = [];

    if (options.term && options.term.trim().length > 0) {
      trendingTerms = [options.term.trim()];
      scannerEvents.emit('info', `Varredura direcionada para o termo em alta: "${options.term}"`);
    } else {
      scannerEvents.emit('step', 'Acessando página inicial da Shopee para verificar a seção "Buscas em alta"...');

      try {
        await page.goto('https://shopee.com.br', {
          waitUntil: 'domcontentloaded',
          timeout: 35000,
        });

        // Comportamento humano: posiciona o cursor, "pensa" antes de agir e
        // rola lentamente para carregar a seção de Buscas em alta.
        await resetCursor(page);
        await humanDelay(1500, 3000);
        await humanScroll(page, 1200);
        await humanDelay(600, 1400);
        await humanMouseIdle(page);

        const extracted = await page.evaluate(() => {
          const terms: string[] = [];
          // Procura por container com "Buscas em alta"
          const headings = Array.from(document.querySelectorAll('*'));
          const target = headings.find((el) => {
            const txt = el.textContent?.trim().toLowerCase();
            return txt === 'buscas em alta' || txt === 'top searches';
          });

          if (target) {
            const parent =
              target.closest('section') ||
              target.closest('div[class*="section"]') ||
              target.parentElement?.parentElement;
            if (parent) {
              const links = parent.querySelectorAll('a, [class*="item"]');
              links.forEach((l) => {
                const text = l.textContent?.replace(/buscas em alta/gi, '').trim();
                if (text && text.length > 2 && text.length < 50 && !terms.includes(text)) {
                  terms.push(text);
                }
              });
            }
          }

          // Links com busca por keyword
          document.querySelectorAll('a[href*="keyword="]').forEach((a) => {
            const text = a.textContent?.trim();
            if (text && text.length > 2 && text.length < 50 && !terms.includes(text)) {
              terms.push(text);
            }
          });

          return terms;
        });

        if (extracted.length > 0) {
          trendingTerms = extracted.slice(0, MAX_TERMS_PER_SCAN);
          scannerEvents.emit(
            'info',
            `Termos capturados da página inicial da Shopee: ${trendingTerms.map((t) => `"${t}"`).join(', ')}`
          );
        }
      } catch (err: any) {
        scannerEvents.emit('warn', `Aviso ao carregar home da Shopee: ${err.message}`);
      }

      // Se não encontrou termos suficientes na página, completa com os termos reais da Shopee
      if (trendingTerms.length < MAX_TERMS_PER_SCAN) {
        for (const fallback of REAL_SHOPEE_TRENDING_TERMS) {
          if (!trendingTerms.includes(fallback)) {
            trendingTerms.push(fallback);
          }
          if (trendingTerms.length >= MAX_TERMS_PER_SCAN) break;
        }
        scannerEvents.emit(
          'info',
          `Termos selecionados da lista de Buscas em Alta: ${trendingTerms.map((t) => `"${t}"`).join(', ')}`
        );
      }
    }

    // 4. Analisar termo a termo ordenado por "Mais recente", salvando até 10 por termo
    const collectedProducts: any[] = [];

    for (let i = 0; i < trendingTerms.length; i++) {
      const term = trendingTerms[i];
      let savedInTerm = 0;

      // Pausa humanizada entre termos para reduzir risco de bloqueio anti-bot
      if (i > 0) {
        const pauseMs = 2000 + Math.floor(Math.random() * 4000);
        scannerEvents.emit(
          'info',
          `Aguardando ${Math.round(pauseMs / 1000)}s antes do próximo termo...`
        );
        await page.waitForTimeout(pauseMs);
      }

      scannerEvents.emit(
        'step',
        `[Termo ${i + 1}/${trendingTerms.length}] Pesquisando "${term}" ordenado por "Mais recente"...`
      );

      // URL de busca com ordenação por mais recente (sortBy=ctime na Shopee)
      const searchUrl = `https://shopee.com.br/search?keyword=${encodeURIComponent(
        term
      )}&sortBy=ctime`;

      try {
        // Pausa "pensada" antes de navegar (um humano não clica no instante)
        // e referer = página Shopee anterior, como se fosse um clique interno.
        await humanDelay(900, 2000);
        const referer = page.url() || 'https://shopee.com.br/';
        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
          referer,
        });
        await resetCursor(page);

        // Bloqueio (gate anti-bot ou login-wall): aborta com mensagem acionável em vez de reportar "0 produtos"
        const blockMessage = await maybeBlockMessage(page);
        if (blockMessage) {
          scannerEvents.emit('error', blockMessage);
          return { success: false, error: blockMessage };
        }

        // Aguarda a grade renderizar; recarrega uma vez se demorar
        let resultsReady = await waitForSearchResults(page);
        if (!resultsReady) {
          scannerEvents.emit(
            'info',
            `[Termo "${term}"] Cards não apareceram; recarregando a página de busca...`
          );
          await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
            referer: page.url() || 'https://shopee.com.br/',
          });
          await resetCursor(page);
          const blockMessage = await maybeBlockMessage(page);
          if (blockMessage) {
            scannerEvents.emit('error', blockMessage);
            return { success: false, error: blockMessage };
          }
          resultsReady = await waitForSearchResults(page);
        }

        // Rola suavemente como um usuário, carregando imagens de até 30 produtos
        await humanDelay(1200, 2400);
        await humanScroll(page, 1700);
        await humanDelay(400, 900);
        await humanMouseIdle(page);

        // Extrai até os primeiros 30 produtos da página
        const rawProductsInit = await page.evaluate(() => {
          const items: Array<{
            rawHref: string;
            rawTitle: string;
            rawPrice: string;
            rawSalesText: string;
            rawImageUrl: string;
          }> = [];

          // Seletores comuns da grade de produtos da Shopee (formatos -i. e /product/)
          const cardElements = document.querySelectorAll(
            'a[data-sqe="link"], a[href*="-i."], a[href*="/product/"], a[href*="shopid="], .shopee-search-item-result__item a'
          );

          cardElements.forEach((card) => {
            if (items.length >= 30) return;

            const href = (card as HTMLAnchorElement).href;
            if (!href) return;

            // Aceita os três formatos: -i.<shopId>.<itemId>, /product/<shopId>/<itemId>
            // e ...?shopid=<shopId>&itemid=<itemId>
            const pathname = href.split('?')[0];
            const hasShopidItemidQuery =
              /[?&]shopid=\d+/.test(href) && /[?&]itemid=\d+/.test(href);
            const isProductLink =
              /-i\.\d+\.\d+/.test(pathname) ||
              /\/product\/\d+\/\d+/.test(pathname) ||
              hasShopidItemidQuery;
            if (!isProductLink) return;

            // Busca título (seletor atual da Shopee não usa mais data-sqe="name")
            const titleEl = card.querySelector(
              '[data-sqe="name"], .line-clamp-2, .whitespace-normal, [class*="name"]'
            );
            let title = titleEl?.textContent?.trim() || '';
            if (!title) {
              const aria = card
                .closest('[aria-label^="Product card"]')
                ?.getAttribute('aria-label')
                ?.replace(/^Product card:\s*/i, '')
                .trim();
              title = aria || '';
            }
            if (!title) {
              title = card.querySelector('img')?.getAttribute('alt')?.trim() || '';
            }

            // Busca preço
            const priceEl = card.querySelector(
              '.text-shopee-primary, [aria-label*="reais"], [class*="price"]'
            );
            let price = priceEl?.textContent?.trim() || '';
            if (!price) {
              const leaf = Array.from(card.querySelectorAll('span, div')).find(
                (el) => el.children.length === 0 && /\bR\$\s?[\d.,]+/.test(el.textContent || '')
              );
              price = leaf?.textContent?.trim() || '';
            }

            // Busca texto de vendas (ex: "5 vendidos", "12 vendidos", "1,2mil vendidos")
            // Na Shopee, geralmente fica próximo ao final do card
            const textContent = card.textContent || '';
            const salesMatch = textContent.match(/([\d.,]+\s*(?:mil|k)?\s*vendidos?)/i);
            const salesText = salesMatch ? salesMatch[1] : '';

            // Imagem
            const imgEl = card.querySelector('img');
            const imageUrl =
              imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

            if (title && href) {
              items.push({
                rawHref: href,
                rawTitle: title,
                rawPrice: price || 'R$ 0,00',
                rawSalesText: salesText,
                rawImageUrl: imageUrl,
              });
            }
          });

          return items;
        });

        let rawProducts: RawCardData[] = rawProductsInit;

        // Busca dados de vendas via API interna: o card de busca da Shopee BR atual
        // não mostra mais "N vendidos" no DOM, então a elegibilidade (>= 5
        // vendas) é decidida com item_basic.sold, histórico de vendas real.
        await humanDelay(1400, 3200);
        const api = await fetchSearchItems(page, term, 30);
        let salesCounted = 0;

        if (api.gated) {
          // Gate anti-bot. Se nem o DOM retornou nada, aborta com mensagem
          // acionável; se o DOM voltou, avisa que vendas ficaram indisponíveis.
          if (rawProducts.length === 0) {
            const blockMessage = (await maybeBlockMessage(page)) || SECURITY_GATE_MESSAGE;
            scannerEvents.emit('error', blockMessage);
            return { success: false, error: blockMessage };
          }
          scannerEvents.emit(
            'warn',
            `[Termo "${term}"] API de vendas bloqueada (gate); usando apenas o que aparece na página.`
          );
        } else {
          const salesMap = buildApiSalesMap(api.items);

          if (rawProducts.length === 0) {
            // DOM sem cards mas API respondeu: produtos vêm da API interna
            scannerEvents.emit(
              'info',
              `[Termo "${term}"] DOM não retornou cards; usando o endpoint interno da Shopee...`
            );
            for (const item of api.items) {
              if (rawProducts.length >= 30) break;
              const mapped = mapApiItemToRawCard(item);
              if (!mapped) continue;
              rawProducts.push(mapped);
            }
            scannerEvents.emit(
              'info',
              `[Termo "${term}"] ${rawProducts.length} produtos obtidos via API interna.`
            );
          } else if (salesMap.size > 0) {
            // DOM renderizou os cards mas sem contagem de vendas: enriquece
            // casando por <shopid>.<itemid> com item_basic.historical_sold.
            const before = rawProducts.length;
            rawProducts = enrichRawCardsWithApiSales(rawProducts, salesMap);
            salesCounted = rawProducts.filter((r) => r.rawSalesText).length;
            scannerEvents.emit(
              'info',
              `[Termo "${term}"] Contagem de vendas aplicada: ${salesCounted}/${before} produtos com contador real da API.`
            );
          }
        }

        scannerEvents.emit(
          'info',
          `[Termo "${term}"] ${rawProducts.length} produtos carregados para inspeção.`
        );

        // Processa cada produto verificado com o seam testado parseProductCard
        for (let j = 0; j < rawProducts.length; j++) {
          const raw = rawProducts[j];
          const candidate = parseProductCard(raw, existingIds);

          // Se for elegível (>= 5 vendas e ainda não cadastrado)
          if (candidate && candidate.isEligible) {
            scannerEvents.emit(
              'success',
              `🎯 Produto elegível encontrado! "${candidate.title}" (${candidate.salesCount} vendas, ${candidate.price})`
            );

            // Salva no banco de dados SQLite
            const savedProduct = await prisma.product.upsert({
              where: { id: candidate.id },
              update: {
                title: candidate.title,
                price: candidate.price,
                salesCount: candidate.salesCount,
                imageUrl: candidate.imageUrl,
                productUrl: candidate.productUrl,
                searchTerm: term,
                status: 'pending',
              },
              create: {
                id: candidate.id,
                title: candidate.title,
                price: candidate.price,
                salesCount: candidate.salesCount,
                imageUrl: candidate.imageUrl,
                productUrl: candidate.productUrl,
                searchTerm: term,
                status: 'pending',
              },
            });

            // Evita duplicata entre termos da mesma varredura
            existingIds.add(candidate.id);
            collectedProducts.push(savedProduct);
            savedInTerm++;

            const eligibleSent = savedInTerm >= MAX_ELIGIBLE_PER_TERM ? ' (meta deste termo atingida)' : '';
            scannerEvents.emit(
              'success',
              `Oportunidade salva no banco! (${savedInTerm}/${MAX_ELIGIBLE_PER_TERM} neste termo)${eligibleSent}`
            );
          }

          // Atingiu o limite de 10 elegíveis deste termo: interrompe este termo
          if (savedInTerm >= MAX_ELIGIBLE_PER_TERM) {
            break;
          }
        }

        if (savedInTerm > 0) {
          scannerEvents.emit(
            'info',
            `Termo "${term}" concluído: ${savedInTerm} produto(s) salvo(s).`
          );
        } else {
          scannerEvents.emit(
            'warn',
            `Nenhum produto novo com >= 5 vendas nos primeiros ${rawProducts.length} produtos de "${term}".`
          );
        }
      } catch (termErr: any) {
        scannerEvents.emit(
          'error',
          `Erro ao pesquisar termo "${term}": ${termErr.message}`
        );
      }
    }

    if (collectedProducts.length > 0) {
      scannerEvents.emit(
        'success',
        `Varredura concluída: ${collectedProducts.length} produto(s) coletados em ${trendingTerms.length} termo(s) pesquisados (máx ${MAX_ELIGIBLE_PER_TERM} por termo).`
      );
      return { success: true, product: collectedProducts };
    }

    scannerEvents.emit(
      'warn',
      `Varredura finalizada. Nenhum produto novo com >= 5 vendas foi encontrado nos ${trendingTerms.length} termos pesquisados.`
    );
    return { success: true, product: null };
  } catch (error: any) {
    console.error('Fatal scanner error:', error);
    scannerEvents.emit('error', `Erro na varredura: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await closeActiveContext();
    scannerEvents.setIsScanning(false);
  }
}
