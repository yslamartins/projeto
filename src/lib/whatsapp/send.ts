import { MessageMedia, type Client } from 'whatsapp-web.js';
import { scannerEvents } from '@/lib/scanner/events';
import { ensureWhatsAppSession, getWhatsAppState } from './client';
import type { Product } from '@/types/product';

export const SHOPEE_VIDEO_GROUP_NAME = 'SHOPEE VIDEO';
export const RECONNECT_WAIT_MS = 8000;
const RECONNECT_POLL_INTERVAL_MS = 250;

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
  resumeTimeoutMs: number = RECONNECT_WAIT_MS
): Promise<WhatsAppSendResult> {
  try {
    const client = await connectWhatsAppOrLog(resumeTimeoutMs);
    if (!client) {
      return { success: false, error: 'WhatsApp não está conectado.' };
    }

    scannerEvents.emit('step', `WhatsApp: procurando o grupo "${SHOPEE_VIDEO_GROUP_NAME}"...`);
    const groupId = await findGroupIdByName(client, SHOPEE_VIDEO_GROUP_NAME);

    if (!groupId) {
      const message = `O grupo "${SHOPEE_VIDEO_GROUP_NAME}" não foi encontrado no WhatsApp.`;
      scannerEvents.emit('warn', `Envio ao WhatsApp ignorado: ${message}`);
      return { success: false, error: message };
    }

    const caption = `${product.title}\n${product.productUrl}`;
    scannerEvents.emit('step', `WhatsApp: enviando vídeo e link para "${SHOPEE_VIDEO_GROUP_NAME}"...`);
    await client.sendMessage(
      groupId,
      MessageMedia.fromFilePath(videoPath),
      { caption }
    );

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
