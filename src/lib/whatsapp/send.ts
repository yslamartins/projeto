import { MessageMedia, type Client } from 'whatsapp-web.js';
import { scannerEvents } from '@/lib/scanner/events';
import { ensureWhatsAppSession, getWhatsAppState } from './client';
import type { Product } from '@/types/product';

export const SHOPEE_VIDEO_GROUP_NAME = 'SHOPEE VIDEO';
export const RECONNECT_WAIT_MS = 8000;
const RECONNECT_POLL_INTERVAL_MS = 250;

// Espera antes de reintentar o envio quando o WA Web recarregou a página: a
// busca do grupo e o `sendMessage` usam `pupPage.evaluate`, que fica preso a um
// frame desanexado ("Attempted to use detached Frame"). Depois de recarregar a
// página, esperamos a sessão reconectar antes de reenviar.
const DETACHED_RETRY_WAIT_MS = 1500;
const WHATSAPP_READY_TIMEOUT_MS = 60000;
const WHATSAPP_READY_POLL_MS = 250;
const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isDetachedFrameError(error: unknown): boolean {
  return error instanceof Error && /detached frame/i.test(error.message);
}

/**
 * Encontra uma OUTRA página viva do WA Web (diferente da atual). Quando o frame
 * desanexado pertence ao target atual, `browser.pages()` devolve a MESMA página
 * órfã — isso não recupera nada; só serve quando o WA Web mudou de target.
 */
async function findLiveWhatsAppPage(
  client: Client
): Promise<NonNullable<Client['pupPage']> | null> {
  if (!client.pupBrowser || typeof client.pupBrowser.pages !== 'function') {
    return null;
  }
  try {
    const pages = await client.pupBrowser.pages();
    return (
      pages.find(
        (page) =>
          !page.isClosed() &&
          page !== client.pupPage &&
          page.url().includes('web.whatsapp.com')
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Recarrega a página do WA Web. `page.reload` navega pelo frame; se ele está
 * desanexado a própria navegação falha, então cai para CDP bruto (`Page.navigate`
 * sem frameId), que reusa a conexão do target e gera um frame novo.
 */
async function reloadWhatsAppPage(client: Client): Promise<void> {
  const page = client.pupPage;
  if (!page) return;
  try {
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    return;
  } catch {
    // frame ainda desanexado nesta navegação; tenta via CDP
  }
  try {
    const session = await page.createCDPSession();
    await session.send('Page.navigate', { url: WHATSAPP_WEB_URL });
    await session.detach();
  } catch {
    // nada a fazer; o retry abaixo decide para onde ir
  }
}

/**
 * Aguarda o WA Web reinjetar `window.WWebJS` e o socket ficar CONNECTED após o
 * reload — sem isso o retry acharia a página mas o envio ainda estaria cego.
 */
async function waitForWhatsAppReady(
  page: NonNullable<Client['pupPage']>
): Promise<void> {
  const deadline = Date.now() + WHATSAPP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const ready = (await page.evaluate(() => {
        const requireModule = (window as unknown as {
          require?: (name: string) => unknown;
        }).require;
        return Boolean(
          (window as unknown as { WWebJS?: unknown }).WWebJS &&
            typeof requireModule === 'function' &&
            (
              requireModule('WAWebSocketModel') as {
                Socket?: { state?: string };
              }
            )?.Socket?.state === 'CONNECTED'
        );
      })) as boolean;
      if (ready) return;
    } catch {
      // página ainda navegando
    }
    await sleep(WHATSAPP_READY_POLL_MS);
  }
  throw new Error('WhatsApp: a página recarregou, mas a sessão não reconectou a tempo.');
}

/**
 * Recupera a sessão após um frame desanexado: usa uma página viva alternativa
 * se houver, senão recarrega a página atual e espera a sessão reconectar.
 */
async function recoverDetachedFrame(client: Client): Promise<void> {
  const livePage = await findLiveWhatsAppPage(client);
  if (livePage) {
    client.pupPage = livePage;
    return;
  }
  await reloadWhatsAppPage(client);
  if (client.pupPage) {
    await waitForWhatsAppReady(client.pupPage);
  }
}

export interface WhatsAppSendResult {
  success: boolean;
  error?: string;
}

export async function connectWhatsAppOrLog(
  waitMs: number = RECONNECT_WAIT_MS
): Promise<Client | null> {
  if (getWhatsAppState() === 'connected') {
    return ensureWhatsAppSession();
  }

  scannerEvents.emit('step', 'WhatsApp: retomando a sessão conectada...');
  await ensureWhatsAppSession();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (getWhatsAppState() === 'connected') {
      return ensureWhatsAppSession();
    }
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_POLL_INTERVAL_MS));
  }

  const message =
    'WhatsApp não está conectado. Abra a janela do navegador do WhatsApp e escaneie o QR code para vincular a sessão.';
  scannerEvents.emit('warn', `Envio ao WhatsApp ignorado: ${message}`);
  return null;
}

async function findGroupIdByName(
  client: Client,
  groupName: string
): Promise<string | null> {
  if (!client.pupPage) {
    return null;
  }
  return client.pupPage.evaluate((name) => {
    const requireModule = (moduleName: string) =>
      (window as unknown as { require: (name: string) => unknown }).require(
        moduleName
      );
    type RawChat = {
      id: { _serialized: string };
      name?: string;
      groupMetadata?: unknown;
    };
    const chats = (
      requireModule('WAWebCollections') as {
        Chat: { getModelsArray: () => RawChat[] };
      }
    ).Chat.getModelsArray();
    const group = chats.find(
      (chat) => chat.groupMetadata && chat.name === name
    );
    return group ? group.id._serialized : null;
  }, groupName);
}

export async function sendVideoAndLinkToGroup(
  product: Pick<Product, 'title' | 'productUrl'>,
  videoPath: string,
  resumeTimeoutMs: number = RECONNECT_WAIT_MS,
  detachedRetryWaitMs: number = DETACHED_RETRY_WAIT_MS
): Promise<WhatsAppSendResult> {
  try {
    const client = await connectWhatsAppOrLog(resumeTimeoutMs);
    if (!client) {
      return { success: false, error: 'WhatsApp não está conectado.' };
    }

    scannerEvents.emit('step', `WhatsApp: procurando o grupo "${SHOPEE_VIDEO_GROUP_NAME}"...`);

    const caption = `${product.title}\n${product.productUrl}`;
    const media = MessageMedia.fromFilePath(videoPath);

    const sendOnce = async (): Promise<void> => {
      const groupId = await findGroupIdByName(client, SHOPEE_VIDEO_GROUP_NAME);
      if (!groupId) {
        const message = `O grupo "${SHOPEE_VIDEO_GROUP_NAME}" não foi encontrado no WhatsApp.`;
        scannerEvents.emit('warn', `Envio ao WhatsApp ignorado: ${message}`);
        throw new Error(message);
      }

      scannerEvents.emit('step', `WhatsApp: enviando vídeo e link para "${SHOPEE_VIDEO_GROUP_NAME}"...`);
      await client.sendMessage(groupId, media, { caption });
    };

    try {
      await sendOnce();
    } catch (error) {
      // WA Web descarta o renderer após ociosidade: a busca do grupo e o envio
      // usam `pupPage.evaluate`, que fica preso a um frame desanexado
      // ("Attempted to use detached Frame"). Recarrega a página (novo frame) e
      // espera a sessão reconectar antes de reenviar.
      if (!isDetachedFrameError(error)) {
        throw error;
      }
      scannerEvents.emit(
        'warn',
        'WhatsApp: a página do WhatsApp Web não estava mais ativa; recarregando e tentando de novo...'
      );
      await recoverDetachedFrame(client);
      await sleep(detachedRetryWaitMs);
      await sendOnce();
    }

    scannerEvents.emit('success', `WhatsApp: vídeo e link enviados para "${SHOPEE_VIDEO_GROUP_NAME}".`);
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro desconhecido ao enviar.';
    scannerEvents.emit('error', `Envio ao WhatsApp falhou: ${message}`);
    return { success: false, error: message };
  }
}

export async function sendProductVideoToWhatsApp(
  product: Pick<Product, 'title' | 'productUrl'>,
  videoPath: string | null
): Promise<void> {
  if (!videoPath) {
    return;
  }
  await sendVideoAndLinkToGroup(product, videoPath).catch(() => {});
}
