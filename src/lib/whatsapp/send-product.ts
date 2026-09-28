import { prisma } from '@/lib/prisma';
import { sendVideoAndLinkToGroup, type WhatsAppSendResult } from './send';

export type SendVideoFailure = 'not_found' | 'no_video' | 'send';

export interface SendVideoOfProductResult extends WhatsAppSendResult {
  failure?: SendVideoFailure;
}

/**
 * Carrega o produto e envia o vídeo baixado para o grupo, com a legenda de nome
 * e link. Sem `videoPath` não há o que enviar: devolve a falha em vez de lançar.
 */
export async function sendVideoOfProductToWhatsApp(
  productId: string
): Promise<SendVideoOfProductResult> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { success: false, failure: 'not_found', error: 'Produto não encontrado' };
  }
  if (!product.videoPath) {
    return {
      success: false,
      failure: 'no_video',
      error: 'Produto não possui vídeo baixado',
    };
  }
  const result = await sendVideoAndLinkToGroup(product, product.videoPath);
  return { ...result, failure: result.success ? undefined : 'send' };
}
