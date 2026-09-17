import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import {
  isSsstikErrorText,
  isSsstikVideoUrl,
  pickSsstikDownloadAnchor,
  SsstikAnchor,
} from './parsing';
import { scannerEvents } from '../scanner/events';
import { closeActiveContext, setActiveContext } from '../scanner/browser-context';
import { launchManagedChrome } from '../scanner/chrome-launcher';
import { humanDelay } from '../scanner/humanize';

// Perfil DEDICADO do ssstik: o download não precisa do login do TikTok.
// Ter um perfil separado evita conflito de lock com o Chrome da busca/sessão
// do TikTok (que usa .tiktok_profile), que era a causa de "Não foi possível
// conectar ao Chrome (CDP) a tempo".
const SSSTIK_PROFILE_DIR = path.resolve(process.cwd(), '.ssstik_profile');
const VIDEOS_DIR = path.resolve(process.cwd(), '.videos');
const SSSTIK_URL = 'https://ssstik.io/pt';

const ANCHOR_EVAL_SEL =
  'a.download_link, .result_overlay a, #block a[href^="http"], a[title="Baixar Vídeo"], .download a[href^="http"]';

export interface DownloadResult {
  success: boolean;
  videoUrl?: string;
  videoPath?: string;
  error?: string;
}

// Tenta extrair a URL real do vídeo dentro de uma página/popup (mp4 no DOM,
// <video>/<source>, meta og:video, âncoras com link de vídeo).
async function captureVideoUrlFromPage(target: Page): Promise<string | null> {
  const direct = target.url();
  if (isSsstikVideoUrl(direct)) return direct;

  try {
    const source = await target.evaluate(() => {
      const vSrc = document.querySelector('video source')?.getAttribute('src');
      if (vSrc) return vSrc;
      const v = document.querySelector('video')?.currentSrc || (document.querySelector('video') as HTMLVideoElement | null)?.src;
      if (v) return v;
      const og = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
      if (og) return og;
      const a = Array.from(document.querySelectorAll('a[href]')).find((el) =>
        /\.mp4|get_video|video_url|create_video/i.test((el as HTMLAnchorElement).href)
      );
      return a ? (a as HTMLAnchorElement).href : null;
    });
    if (source && isSsstikVideoUrl(source)) return source;
    return null;
  } catch {
    return null;
  }
}

// Verifica se o arquivo começa com um box "ftyp" (magic bytes de MP4).
// Usado para NÃO aceitar arquivos que o anúncio baixa (HTML/ads) no lugar do vídeo.
function isValidMp4File(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).includes(Buffer.from('ftyp'));
  } catch {
    return false;
  }
}

// Aguarda/resolve o ANÚNCIO ÚNICO do ssstik. Segue o fluxo real:
// o site abre com 1 anúncio (contagem de ~20s). Só depois do tempo passar é
// que devemos clicar em "fechar anúncio" — antes disso NÃO fecha (clicar cedo
// captura lixo de download no lugar do vídeo). Retorna `true` se o anúncio já
// está "liberado" (sem contagem, ou "fechar anúncio" clicado).
async function handleAdOverlay(page: Page): Promise<boolean> {
  try {
    const state = await page.evaluate(() => {
      const cleanText = (el: HTMLElement) =>
        `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.trim();

      const candidates = Array.from(
        document.querySelectorAll(
          'button, a[href], [role="button"], [class*="close"], [class*="dismiss"], [class*="skip"], [class*="pular"], [aria-label]'
        )
      ) as HTMLElement[];

      for (const el of candidates) {
        const text = cleanText(el);
        const isClose =
          /(fechar|close|dismiss|skip|pular)/i.test(text) ||
          /^\s*[×✕✖]\s*$/.test((el.textContent || '').trim());

        if (!isClose) continue;

        const cls = `${el.className || ''} ${el.getAttribute('aria-disabled') || ''}`;
        const style = el.getAttribute('style') || '';
        const isDisabled =
          el.hasAttribute('disabled') ||
          (el as HTMLButtonElement).disabled === true ||
          /disabled|pointer-events\s*:\s*none/i.test(`${cls} ${style}`);

        if (isDisabled) {
          // contagem ainda ativa — espera
          return { pending: true };
        }

        // "Fechar (9s)" / "(5)" → ainda contando
        const countdown = text.match(/(\d{1,2})\s*(s|seg|sec|second|segundo)?\s*$/i);
        if (countdown && parseInt(countdown[1], 10) > 0) {
          return { pending: true };
        }

        // Liberado → clique em "fechar anúncio"
        (el as HTMLElement).click();
        return { pending: false, clicked: true };
      }

      // Sem botão de fechar visível: anúncio ausente/já saiu → liberado
      return { pending: false };
    });

    if (state.clicked) {
      scannerEvents.emit('info', 'Contagem do anúncio terminou: clique em "fechar anúncio".');
      await humanDelay(900, 1800);
    }
    return !state.pending;
  } catch {
    return false;
  }
}

// Clica no botão "Sem Marca D'Água" (HD). Prioridade:
// 1) qualquer elemento com o texto "sem marca d'água"/"no watermark";
// 2) links de download reais do resultado com "HD";
// 3) qualquer link de download do resultado que não seja "SD".
async function clickHdDownloadButton(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const isAd = (el: HTMLElement) =>
      /advert|adlink|sponsor|popup|ads/i.test(`${el.className || ''} ${el.id || ''}`);
    const clean = (el: HTMLElement) =>
      `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`;

    // 1) "Sem Marca D'Água" — o botão de HD do ssstik (texto autoritativo)
    const all = Array.from(
      document.querySelectorAll('a, button, [role="button"], [class*="btn"], [class*="download"]')
    ) as HTMLElement[];
    const noWatermark = all.find(
      (el) => !isAd(el) && /sem marca d[''’áa]?gua|no watermark/i.test(clean(el))
    );
    if (noWatermark) {
      (noWatermark as HTMLElement).click();
      return true;
    }

    // 2/3) Links de download reais do resultado (não anúncios)
    const downloadLinks = Array.from(
      document.querySelectorAll(
        'a.download_link, .result_overlay a, #block a[href^="http"], a[title="Baixar Vídeo"], a[href*="get_video"], a[href$=".mp4"], a[href*="video_url"]'
      )
    ) as HTMLAnchorElement[];
    const links = downloadLinks.filter(
      (a) => a.href && /^https?:/.test(a.href) && !isAd(a)
    );

    const hd = links.find((a) => /(^|\s)HD(\s|$)/i.test(clean(a)));
    const anyLink = links.find((a) => !/SD/i.test(a.textContent || ''));
    const target = hd || anyLink;
    if (target) {
      (target as HTMLAnchorElement).click();
      return true;
    }

    return false;
  });

  return clicked;
}

export async function downloadTikTokVideo(options: {
  tikTokUrl: string;
  productId: string;
  headful?: boolean;
}): Promise<DownloadResult> {
  const { tikTokUrl, productId, headful } = options;

  if (scannerEvents.getIsScanning() || scannerEvents.getVideoProcessing()) {
    return { success: false, error: 'Outra automação em andamento.' };
  }

  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  const outPath = path.join(VIDEOS_DIR, `${productId}.mp4`);
  let context: any;
  let finalVideoUrl: string | null = null;

  try {
    scannerEvents.setVideoProcessing(true);

    const managed = await launchManagedChrome({
      userDataDir: SSSTIK_PROFILE_DIR,
      headless: !headful,
    });
    context = managed.context;
    setActiveContext(context, managed.dispose);

    const page = context.pages()[0] || (await context.newPage());

    // Escuta popups/intersticiais E download direto. O ssstik "libera" o vídeo
    // de formas diferentes: popup com countdown, âncora na própria página,
    // mudança de URL ou download direto (evento `download` do navegador).
    let popupVideoUrl: string | null = null;
    let browserDownload: { url: string; download: any } | null = null;
    let downloadConsumed = false;
    // O ssstik só libera o vídeo DEPOIS que a contagem do anúncio termina e
    // clicamos em "fechar anúncio". Downloads iniciados antes disso são lixo
    // (HTML/redirect do próprio anúncio) e devem ser ignorados. O anúncio é
    // UMA POSSIBILIDADE: quando não há anúncio, adsReleased vira true logo.
    let adsReleased = false;
    // Atribuído só dentro de callbacks; expor via getter evita o TS estreitar
    // a variável para `null`/`never` no fluxo linear.
    const getBrowserDownload = () => browserDownload;

    const handleDirectDownload = (dl: any) => {
      const url = dl?.url?.() || '';
      if (!url) return;
      const isVideo = isSsstikVideoUrl(url) || /\.mp4(\?|#|$)/i.test(url);
      if (adsReleased && isVideo) {
        scannerEvents.emit('info', `Download direto do vídeo iniciado pelo navegador: ${url.slice(0, 80)}...`);
        browserDownload = { url, download: dl };
      } else {
        scannerEvents.emit(
          'warn',
          `Download ignorado (anúncio ainda não liberado${isVideo ? '' : ' ou não-vídeo'}): ${url.slice(0, 80)}`
        );
      }
    };

    // Download direto na página principal
    page.on('download', handleDirectDownload);

    page.on('popup', async (popup: any) => {
      scannerEvents.emit('info', 'Intersticial detectado: aguardando contagem/anúncio...');
      // Download disparado dentro do popup também conta
      popup.on('download', handleDirectDownload);
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});

        // Poll na URL/DOM do popup por até 30s: espera o anúncio liberar
        // (contagem terminar → só então clica em "fechar anúncio") e procura o
        // vídeo. Não fecha o anúncio antes do tempo — isso gera lixo de download.
        const startedAt = Date.now();
        while (Date.now() - startedAt < 30000 && !popup.isClosed() && !popupVideoUrl && !browserDownload) {
          const url = popup.url();
          if (url && (isSsstikVideoUrl(url) || /\.mp4(\?|#|$)/i.test(url))) {
            adsReleased = true;
            popupVideoUrl = url;
            break;
          }
          const captured = await captureVideoUrlFromPage(popup).catch(() => null);
          if (captured && isSsstikVideoUrl(captured)) {
            adsReleased = true;
            popupVideoUrl = captured;
            break;
          }

          // Espera a contagem do anúncio e clica em "fechar anúncio" quando liberado
          const adDone = await handleAdOverlay(popup);
          if (adDone) {
            adsReleased = true;
            scannerEvents.emit('info', 'Anúncio do intersticial liberado; procurando o vídeo...');
          }

          await page.waitForTimeout(1000);
        }

        if (popupVideoUrl) {
          scannerEvents.emit(
            'success',
            `Link real do vídeo encontrado após o anúncio: ${popupVideoUrl.substring(0, 80)}...`
          );
        } else if (/(recaptcha|azcaptcha|capcha|captcha|verifica)/i.test(((await popup.locator('body').innerText({ timeout: 2000 }).catch(() => '')) || '').slice(0, 500))) {
          scannerEvents.emit('warn', 'Intersticial exibiu verificação; aguardando próxima tentativa...');
        } else if (!browserDownload) {
          scannerEvents.emit('info', 'Popup de anúncio fechado automaticamente.');
        }
      } catch {
        // ignora e segue
      } finally {
        await popup.close().catch(() => {});
      }
    });

    scannerEvents.emit('step', 'Navegando para ssstik.io/pt...');
    await page.goto(SSSTIK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(1800, 3200);

    const inputSelector = 'input[name="id"], #main_page_text';
    scannerEvents.emit('info', 'Colando a URL do vídeo do TikTok...');
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.fill(inputSelector, tikTokUrl);
    await humanDelay(700, 1400);

    const submitSelector =
      '#submit, button[type="submit"], button:has-text("Baixar"), input[type="submit"]';
    scannerEvents.emit('info', 'Clicando em "Baixar"...');
    await page.click(submitSelector);
    await humanDelay(2500, 4000);

    // --- Passo 1: clicar no botão "Baixar em HD" ---
    let clickedHd = false;
    const clickWindowMs = 15000;
    const clickPollMs = 1000;
    for (let elapsed = 0; elapsed < clickWindowMs; elapsed += clickPollMs) {
      await page.waitForTimeout(clickPollMs);

      const bodyText = (await page.locator('body').innerText({ timeout: 4000 }).catch(() => '')) || '';
      if (isSsstikErrorText(bodyText)) {
        return {
          success: false,
          error:
            'ssstik exibiu verificação/captcha. Tente novamente mais tarde ou com navegador visível.',
        };
      }

      if (await clickHdDownloadButton(page)) {
        clickedHd = true;
        scannerEvents.emit('success', 'Botão "Sem Marca D\'Água (HD)" clicado!');
        break;
      }
    }

    if (!clickedHd) {
      return {
        success: false,
        error: 'Não foi possível encontrar/clicar o botão de download em HD no ssstik.',
      };
    }

    // --- Passo 2: aguardar o anúncio/intersticial passar ---
    scannerEvents.emit('step', 'Aguardando o anúncio/intersticial passar para liberar o link HD...');
    const waitWindowMs = 35000;
    const waitPollMs = 1000;
    for (let elapsed = 0; elapsed < waitWindowMs; elapsed += waitPollMs) {
      await page.waitForTimeout(waitPollMs);

      // Mantém anúncios intersticiais fechados enquanto aguarda o link
      await closeAds(page);

      if (popupVideoUrl) {
        finalVideoUrl = popupVideoUrl;
        break;
      }

      // Download direto iniciado pelo navegador (principal ou popup)
      const directDownload = getBrowserDownload();
      if (directDownload) {
        finalVideoUrl = directDownload.url;
        break;
      }

      if (isSsstikVideoUrl(page.url())) {
        finalVideoUrl = page.url();
        break;
      }

      // Página com <video>/og:video (alguns fluxos embutem o player no lugar)
      const inlineVideo = await captureVideoUrlFromPage(page).catch(() => null);
      if (inlineVideo && isSsstikVideoUrl(inlineVideo)) {
        finalVideoUrl = inlineVideo;
        break;
      }

      const bodyText = (await page.locator('body').innerText({ timeout: 4000 }).catch(() => '')) || '';
      if (isSsstikErrorText(bodyText)) {
        return {
          success: false,
          error:
            'ssstik exibiu verificação durante o intersticial. Tente novamente com navegador visível.',
        };
      }

      const anchors: SsstikAnchor[] = await page.evaluate((sel: string) => {
        const elements = Array.from(document.querySelectorAll(sel));
        return elements.map((el) => ({
          href: (el as HTMLAnchorElement).href || '',
          text: el.textContent || '',
          title: (el as HTMLAnchorElement).title || '',
          className: el.className || '',
        }));
      }, ANCHOR_EVAL_SEL);

      const found = pickSsstikDownloadAnchor(anchors);
      if (found && isSsstikVideoUrl(found)) {
        finalVideoUrl = found;
        break;
      }
    }

    if (!finalVideoUrl) {
      return {
        success: false,
        error:
          'O anúncio/intersticial não liberou o link de download a tempo. Tente novamente (ideal: Modo Visível) ou mais tarde.',
      };
    }

    scannerEvents.emit('success', `Link HD capturado após o anúncio: ${finalVideoUrl.substring(0, 80)}...`);

    // --- Passo 3: baixar o MP4 ---
    scannerEvents.emit('step', 'Baixando o arquivo MP4...');
    let savedBytes = 0;

    if (getBrowserDownload() && !downloadConsumed) {
      scannerEvents.emit('info', 'Capturando vídeo do download real do navegador...');
      try {
        const stream = await getBrowserDownload()!.download.createReadStream();
        downloadConsumed = true;
        const ws = fs.createWriteStream(outPath, { flags: 'w' });
        await pipeline(stream, ws);
        savedBytes = fs.statSync(outPath).size;
        scannerEvents.emit('info', 'Vídeo capturado do download do navegador.');
      } catch (error: any) {
        scannerEvents.emit(
          'warn',
          `Falha ao capturar download direto (${error.message}). Tentando via rede...`
        );
        fs.rmSync(outPath, { force: true });
      }
    }

    // Fallback: baixar o MP4 via rede usando a sessão do navegador
    if (savedBytes >= 1024) {
      // ok, nada a fazer
    } else {
      const response = await context.request.get(finalVideoUrl, {
        timeout: 120000,
        headers: { Referer: SSSTIK_URL },
      });

      if (!response.ok()) {
        return {
          success: false,
          error: `Falha ao baixar: status HTTP ${response.status()}`,
        };
      }

      const buffer = await response.body();
      if (buffer.length < 1024) {
        return { success: false, error: 'Arquivo MP4 inválido ou muito pequeno.' };
      }

      fs.writeFileSync(outPath, buffer);
      savedBytes = buffer.length;
    }

    const stats = fs.statSync(outPath);
    if (stats.size < 1024) {
      return { success: false, error: 'Arquivo MP4 inválido ou muito pequeno.' };
    }
    scannerEvents.emit(
      'success',
      `Vídeo salvo: ${outPath} (${(stats.size / 1048576).toFixed(1)} MB)`
    );

    return { success: true, videoUrl: finalVideoUrl, videoPath: outPath };
  } catch (error: any) {
    console.error('Error downloading TikTok video:', error);
    scannerEvents.emit('error', `Erro ao baixar vídeo: ${e