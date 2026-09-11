import { chromium, BrowserContext, Page } from 'playwright';
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
import { parseProductCard } from './product-card-parser';

const PROFILE_DIR = path.resolve(process.cwd(), '.shopee_profile');

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

    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: isHeadless,
      viewport: { width: 1366, height: 768 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
      ],
    });

    const pages = context.pages();
    const page: Page = pages.length > 0 ? pages[0] : await context.newPage();

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

        // Scroll para carregar a seção de Buscas em alta na home
        await page.waitForTimeout(2000);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1500);

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
          trendingTerms = extracted.slice(0, 5);
          scannerEvents.emit(
            'info',
            `Termos capturados da página inicial da Shopee: ${trendingTerms.map((t) => `"${t}"`).join(', ')}`
          );
        }
      } catch (err: any) {
        scannerEvents.emit('warn', `Aviso ao carregar home da Shopee: ${err.message}`);
      }

      // Se não encontrou termos suficientes na página, completa com os termos reais da Shopee
      if (trendingTerms.length < 5) {
        for (const fallback of REAL_SHOPEE_TRENDING_TERMS) {
          if (!trendingTerms.includes(fallback)) {
            trendingTerms.push(fallback);
          }
          if (trendingTerms.length >= 5) break;
        }
        scannerEvents.emit(
          'info',
          `Termos selecionados da lista de Buscas em Alta: ${trendingTerms.map((t) => `"${t}"`).join(', ')}`
        );
      }
    }

    // 4. Analisar termo a termo ordenado por "Mais recente"
    for (let i = 0; i < trendingTerms.length; i++) {
      const term = trendingTerms[i];
      scannerEvents.emit(
        'step',
        `[Termo ${i + 1}/5] Pesquisando "${term}" ordenado por "Mais recente"...`
      );

      // URL de busca com ordenação por mais recente (sortBy=ctime na Shopee)
      const searchUrl = `https://shopee.com.br/search?keyword=${encodeURIComponent(
        term
      )}&sortBy=ctime`;

      try {
        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        // Simula scroll suave para carregar as imagens e badges de até 30 produtos
        await page.waitForTimeout(1500);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(1000);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1500);

        // Extrai até os primeiros 30 produtos da página
        const rawProducts = await page.evaluate(() => {
          const items: Array<{
            href: string;
            title: string;
            price: string;
            salesText: string;
            imageUrl: string;
          }> = [];

          // Seletores comuns da grade de produtos da Shopee
          const cardElements = document.querySelectorAll(
            'a[data-sqe="link"], a[href*="-i."], .shopee-search-item-result__item a'
          );

          cardElements.forEach((card) => {
            if (items.length >= 30) return;

            const href = (card as HTMLAnchorElement).href;
            if (!href || !href.includes('-i.')) return;

            // Busca título
            const titleEl = card.querySelector(
              '[data-sqe="name"], .line-clamp-2, .whitespace-normal'
            );
            const title = titleEl?.textContent?.trim() || '';

            // Busca preço
            const priceEl = card.querySelector(
              '.text-shopee-primary, [aria-label*="reais"], span:has-text("R$")'
            );
            const price = priceEl?.textContent?.trim() || '';

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
                href,
                title,
                price: price || 'R$ 0,00',
                salesText,
                imageUrl,
              });
            }
          });

          return items;
        });

        scannerEvents.emit(
          'info',
          `[Termo "${term}"] ${rawProducts.length} produtos carregados para inspeção.`
        );

        // Processa cada produto verificado com o seam testado parseProductCard
        for (let j = 0; j < rawProducts.length; j++) {
          const raw = rawProducts[j];
          const candidate = parseProductCard(
            {
              rawHref: raw.href,
              rawTitle: raw.title,
              rawPrice: raw.price,
              rawSalesText: raw.salesText,
              rawImageUrl: raw.imageUrl,
            },
            existingIds
          );

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

            scannerEvents.emit(
              'success',
              `Oportunidade salva no banco com sucesso! Status: Pendente.`
            );

            // Encerrar varredura imediatamente com sucesso
            return { success: true, product: savedProduct };
          }
        }

        scannerEvents.emit(
          'warn',
          `Nenhum produto novo com >= 5 vendas nos primeiros ${rawProducts.length} produtos de "${term}".`
        );
      } catch (termErr: any) {
        scannerEvents.emit(
          'error',
          `Erro ao pesquisar termo "${term}": ${termErr.message}`
        );
      }
    }

    scannerEvents.emit(
      'warn',
      'Varredura finalizada. Nenhum produto novo com >= 5 vendas foi encontrado nos 5 termos pesquisados.'
    );
    return { success: true, product: null };
  } catch (error: any) {
    console.error('Fatal scanner error:', error);
    scannerEvents.emit('error', `Erro na varredura: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {}
    }
    scannerEvents.setIsScanning(false);
  }
}
