import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { scannerEvents } from './events';
import { closeActiveContext, getActiveContext, setActiveContext } from './browser-context';
import { launchManagedChrome } from './chrome-launcher';
import { humanDelay, humanScroll, resetCursor } from './humanize';
import {
  rankTikTokVideos,
  toAbsoluteTikTokUrl,
  TikTokSearchCard,
} from './tiktok-relevance';

const TIKTOK_PROFILE_DIR = path.resolve(process.cwd(), '.tiktok_profile');
const TIKTOK_LOGIN_MESSAGE =
  'O TikTok exibiu verificação de segurança ou exigiu login para ver os resultados. Clique em "Login TikTok", autentique/ resolva o desafio uma única vez no navegador visível e rode de novo (de preferência com "Modo Visível").';

async function collectTikTokSearchCards(page: Page): Promise<TikTokSearchCard[]> {
  const cards: TikTokSearchCard[] = await page.evaluate(() => {
    const found: TikTokSearchCard[] = [];

    const cardEls = Array.from(
      document.querySelectorAll('a[href*="/video/"]')
    );

    cardEls.forEach((el) => {
      const href = (el as HTMLAnchorElement).href || '';
      if (!href) return;
      const key = href.split('?')[0];
      if (found.some((c) => c.href === key)) return;

      // Legenda próxima ao link: sobe no contêiner e desce até um texto
      let caption = '';
      let node: HTMLElement | null = el as HTMLElement;
      for (let depth = 0; depth < 4 && node && !caption; depth++) {
        node = node.parentElement;
        if (node) {
          const texts = Array.from(node.querySelectorAll('span, div, p'))
            .map((n) => (n.textContent || '').trim())
            .filter((t) => t && t.length > 2);
          caption = texts[0] || '';
        }
      }

      const authorMatch = key.match(/\/(@[\w.]+)\//);
      found.push({
        href: key,
        caption: (caption || '').slice(0, 200),
        author: authorMatch ? authorMatch[1].replace('@', '') : '',
      });
    });

    return found;
  });

  return cards;
}

function extractInterestingTikTokCards(cards: TikTokSearchCard[]): TikTokSearchCard[] {
  const seen = new Set<string>();
  const unique: TikTokSearchCard[] = [];
  for (const c of cards) {
    const id = c.href.split('?')[0];
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(c);
  }
  return unique;
}

export async function openTikTokSession(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    if (!fs.existsSync(TIKTOK_PROFILE_DIR)) {
      fs.mkdirSync(TIKTOK_PROFILE_DIR, { recursive: true });
    }

    if (getActiveContext()) {
      scannerEvents.emit('warn', 'Fechando sessão de navegador anterior para liberar o perfil...');
      await closeActiveContext();
    }

    scannerEvents.emit('step', 'Iniciando navegador Chrome visível com perfil TikTok (.tiktok_profile)...');

    const managed = await launchManagedChrome({
      userDataDir: TIKTOK_PROFILE_DIR,
      headless: false,
    });
    const context = managed.context;
    setActiveContext(context, managed.dispose);

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    scannerEvents.emit('info', 'Navegando para o TikTok...');
    await page.goto('https://www.tiktok.com', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    scannerEvents.emit(
      'success',
      'TikTok aberto! Faça o login ou resolva qualquer verificação. A janela pode ser fechada quando terminar.'
    );

    page.on('close', async () => {
      await closeActiveContext();
      scannerEvents.emit('info', 'Sessão do TikTok encerrada e cookies salvos no perfil.');
    });

    return { success: true, message: 'Navegador TikTok aberto com sucesso.' };
  } catch (error: any) {
    console.error('Error opening TikTok session:', error);
    scannerEvents.emit('error', `Falha ao abrir TikTok: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function searchTikTokVideo(options: {
  term: string;
  headful?: boolean;
}): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const term = (options.term || '').trim();
  if (!term) {
    return { success: false, error: 'Termo de busca vazio.' };
  }

  if (scannerEvents.getIsScanning() || scannerEvents.getVideoProcessing()) {
    return {
      success: false,
      error: 'Outra tarefa de automação (varredura ou vídeo) já está em execução.',
    };
  }

  const headful = Boolean(options.headful);
  let context: any;

  try {
    scannerEvents.setVideoProcessing(true);

    if (!fs.existsSync(TIKTOK_PROFILE_DIR)) {
      fs.mkdirSync(TIKTOK_PROFILE_DIR, { recursive: true });
    }

    if (getActiveContext()) {
      scannerEvents.emit(
        'warn',
        'Fechando sessão de navegador aberta para liberar o perfil persistente...'
      );
      await closeActiveContext();
    }

    const managed = await launchManagedChrome({
      userDataDir: TIKTOK_PROFILE_DIR,
      headless: !headful,
    });
    context = managed.context;
    setActiveContext(context, managed.dispose);

    const page = context.pages()[0] || (await context.newPage());

    scannerEvents.emit('step', `Buscando vídeos no TikTok para "${term}"...`);
    await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(term)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    await page.waitForTimeout(3500);
    await resetCursor(page);

    // Detecção de login-wall / verificação
    const pageUrl = page.url();
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const blocked =
      pageUrl.includes('/login') ||
      /verifique|log in to continue|faça login|para continuar|verification|captcha/i.test(
        bodyText.slice(0, 2500)
      );

    if (blocked) {
      scannerEvents.emit('error', TIKTOK_LOGIN_MESSAGE);
      return { success: false, error: TIKTOK_LOGIN_MESSAGE };
    }

    // Rola a página de forma humana para carregar mais resultados
    await humanScroll(page, 2600);
    await humanDelay(600, 1400);

    const rawCards = await collectTikTokSearchCards(page);
    const cards = extractInterestingTikTokCards(rawCards);

    if (cards.length === 0 && (await isTikTokBlocked(page))) {
      scannerEvents.emit('error', TIKTOK_LOGIN_MESSAGE);
      return { success: false, error: TIKTOK_LOGIN_MESSAGE };
    }

    scannerEvents.emit(
      'info',
      `${cards.length} vídeo(s) encontrados na busca do TikTok. Avaliando relevância...`
    );

    const best = rankTikTokVideos(cards, term);

    if (!best) {
      scannerEvents.emit(
        'warn',
        `Nenhum vídeo suficientemente relevante encontrado no TikTok para "${term}".`
      );
      return { success: false, error: 'Nenhum vídeo relevante encontrado no TikTok.' };
    }

    const videoUrl = toAbsoluteTikTokUrl(best.card.href);
    scannerEvents.emit(
      'success',
      `Vídeo relevante encontrado: ${videoUrl} (score ${best.score})`
    );

    return { success: true, videoUrl };
  } catch (error: any) {
    console.error('Error searching TikTok:', error);
    scannerEvents.emit('error', `Erro ao buscar no TikTok: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await closeActiveContext();
    scannerEvents.setVideoProcessing(false);
  }
}

async function isTikTokBlocked(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    const text = (await page.locator('body').innerText({ timeout: 4000 })) || '';
    return (
      url.includes('/login') ||
      /verifique|log in to continue|faça login|para continuar|verification|captcha/i.test(
        text.slice(0, 2500)
      )
    );
  } catch {
    return false;
  }
}