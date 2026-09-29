import { prisma } from '@/lib/prisma';
import { scannerEvents } from './events';
import { parseProductCard, RawCardData } from './product-card-parser';
import { MIN_SALES } from './parser';
import { runCollect } from './spawn-driver';

const MAX_TERMS_PER_SCAN = 20;
const MAX_PRODUCTS_PER_TERM = 30;
const MAX_ELIGIBLE_PER_TERM = 10;

// Teto por termo bem acima do tempo nominal (~40s), só para impedir que um
// driver travado (rede/anti-bot) segure a varredura inteira. O `runCollect`
// encerra o subprocesso e devolve `ok:false`; o engine continua os demais termos.
const TERM_TIMEOUT_MS = 6 * 60 * 1000;

// Termos em alta reais extraídos da seção "Buscas em alta" da Shopee.
// Usados como fallback quando o driver não consegue capturar os termos vivos.
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

interface TrendingTermsOutcome {
  terms: string[];
  count: number;
  source: string;
}

interface SearchTermOutcome {
  term: string;
  cards: RawCardData[];
  count: number;
  block: string | null;
  gated?: boolean;
}

function driverArgs(extra: string[], headful: boolean): string[] {
  return [...extra, ...(headful ? ['--headful'] : [])];
}

/**
 * Obtém os termos de "Buscas em alta" via driver Python; em falha, cai para a
 * lista fixa REAL_SHOPEE_TRENDING_TERMS (comportamento original do engine).
 */
async function collectTrendingTerms(headful: boolean): Promise<string[]> {
  const outcome = await runCollect<TrendingTermsOutcome>({
    args: driverArgs(['shopee', 'terms'], headful),
  });

  if (outcome.ok && Array.isArray(outcome.data?.terms) && outcome.data!.terms.length > 0) {
    return outcome.data!.terms.slice(0, MAX_TERMS_PER_SCAN);
  }

  scannerEvents.emit(
    'warn',
    `Driver não obteve termos de "Buscas em alta" (${outcome.error || 'erro desconhecido'}); usando a lista de fallback.`
  );

  return REAL_SHOPEE_TRENDING_TERMS.slice(0, MAX_TERMS_PER_SCAN);
}

/**
 * Executa a coleta de um termo no driver Python, repassando os logs do driver
 * ao terminal/SSE. Nunca lança: falha de driver/gate virão como `outcome.ok=false`.
 */
async function collectTermCards(term: string, headful: boolean) {
  return runCollect<SearchTermOutcome>({
    args: driverArgs(['shopee', 'search', '--term', term], headful),
    timeoutMs: TERM_TIMEOUT_MS,
  });
}

// Pausa humanizada entre termos para reduzir risco de bloqueio anti-bot.
// `SCRAPLING_TEST_FAST=1` zera a espera (hábito só para testes de integração).
function humanPauseBetweenTerms(): number {
  if (process.env.SCRAPLING_TEST_FAST === '1') return 0;
  return 2000 + Math.floor(Math.random() * 4000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  try {
    // 1. Carregar produtos já existentes para evitar duplicatas
    const existingProducts = await prisma.product.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.id));
    scannerEvents.emit(
      'info',
      `Base de dados carregada: ${existingIds.size} produtos já conhecidos serão ignorados.`
    );

    // 2. Obter termos de "Buscas em alta"
    let trendingTerms: string[] = [];

    if (options.term && options.term.trim().length > 0) {
      trendingTerms = [options.term.trim()];
      scannerEvents.emit('info', `Varredura direcionada para o termo em alta: "${options.term}"`);
    } else {
      scannerEvents.emit('step', 'Acessando página inicial da Shopee para verificar a seção "Buscas em alta"...');
      trendingTerms = await collectTrendingTerms(Boolean(options.headful));
      scannerEvents.emit(
        'info',
        `Termos selecionados: ${trendingTerms.map((t) => `"${t}"`).join(', ')}`
      );
    }

    // 3. Analisar termo a termo ordenado por "Mais recente", salvando até 10 por termo
    const collectedProducts: any[] = [];

    for (let i = 0; i < trendingTerms.length; i++) {
      const term = trendingTerms[i];
      let savedInTerm = 0;

      // Pausa humanizada entre termos para reduzir risco de bloqueio anti-bot
      if (i > 0) {
        const pauseMs = humanPauseBetweenTerms();
        scannerEvents.emit(
          'info',
          `Aguardando ${Math.round(pauseMs / 1000)}s antes do próximo termo...`
        );
        await sleep(pauseMs);
      }

      scannerEvents.emit(
        'step',
        `[Termo ${i + 1}/${trendingTerms.length}] Pesquisando "${term}" ordenado por "Mais recente"...`
      );

      // Driver Python (Scrapling): coleta DOM + API, detecta gates e devolve RawCardData[]
      let outcome;
      try {
        outcome = await collectTermCards(term, Boolean(options.headful));
      } catch (termErr: any) {
        scannerEvents.emit(
          'error',
          `Erro ao pesquisar termo "${term}": ${termErr.message}`
        );
        continue;
      }

      // Falha do driver ou gate: reporta e segue para os demais termos
      if (!outcome.ok) {
        scannerEvents.emit('error', `[Termo "${term}"] ${outcome.error || 'Falha no driver.'}`);
        continue;
      }

      const rawProducts: RawCardData[] = Array.isArray(outcome.data?.cards)
        ? outcome.data!.cards.slice(0, MAX_PRODUCTS_PER_TERM)
        : [];

      if (rawProducts.length === 0) {
        scannerEvents.emit(
          'warn',
          `Nenhum produto retornado pelo driver para "${term}".`
        );
        continue;
      }

      scannerEvents.emit(
        'info',
        `[Termo "${term}"] ${rawProducts.length} produtos carregados para inspeção.`
      );

      // Processa cada produto com o seam testado parseProductCard
      for (let j = 0; j < rawProducts.length; j++) {
        const raw = rawProducts[j];
        const candidate = parseProductCard(raw, existingIds);

        // Se for elegível (>= MIN_SALES vendas e ainda não cadastrado)
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
          `Nenhum produto novo com >= ${MIN_SALES} venda(s) nos primeiros ${rawProducts.length} produtos de "${term}".`
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
      `Varredura finalizada. Nenhum produto novo com >= ${MIN_SALES} venda(s) foi encontrado nos ${trendingTerms.length} termos pesquisados.`
    );
    return { success: true, product: null };
  } catch (error: any) {
    console.error('Fatal scanner error:', error);
    scannerEvents.emit('error', `Erro na varredura: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    scannerEvents.setIsScanning(false);
  }
}