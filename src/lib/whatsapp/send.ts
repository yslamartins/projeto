import { MessageMedia } from 'whatsapp-web.js';
import { scannerEvents } from '@/lib/scanner/events';
import { ensureWhatsAppSession, getWhatsAppState } from './client';
import type { Product } from '@/types/product';

export const SHOPEE_VIDEO_GROUP_NAME = 'SHOPEE VIDEO';

export interface WhatsAppSendResult {
  success: boolean;
  error?: string;
}

export async function sendVideoAndLinkToGroup(
  product: Pick<Product, 'title' | 'productUrl'>,
  videoPath: string
): Promise<WhatsAppSendResult> {
  try {
    if (getWhatsAppState() !== 'connected') {
      const message =
        'WhatsApp não está conectado. Abra /api/whatsapp/qr para vincular o WhatsApp.';
      scannerEvents.emit('warn', `Envio ao WhatsApp ignorado: ${message}`);
      return { success: false, error: message };
    }

    scannerEvents.emit('step', `WhatsApp: procurando o grupo "${SHOPEE_VIDEO_GROUP_NAME}"...`);
    const client = await ensureWhatsAppSession();
    const chats = await client.getChats();
    const group = chats.find(
      (chat) => chat.isGroup && chat.name === SHOPEE_VIDEO_GROUP_NAME
    );

    if (!group) {
      const message = `O grupo "${SHOPEE_VIDEO_GROUP_NAME}" não foi encontrado no WhatsApp.`;
      scannerEvents.emit('warn', `Envio ao WhatsApp ignorado: ${message}`);
      return { success: false, error: message };
    }

    const caption = `${product.title}\n${product.productUrl}`;
    scannerEvents.emit('step', `WhatsApp: enviando vídeo e link para "${group.name}"...`);
    await client.sendMessage(
      group.id._serialized,
      MessageMedia.fromFilePath(videoPath),
      { caption }
    );

    scannerEvents.emit('success', `WhatsApp: vídeo e link enviados para "${group.name}".`);
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
