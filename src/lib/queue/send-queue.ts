import { prisma } from '@/lib/prisma';
import { scannerEvents } from '@/lib/scanner/events';
import { queueRunner, type QueueStartResult } from './runner';
import { sendVideoOfProductToWhatsApp } from '@/lib/whatsapp/send-product';

interface PendingSend {
  id: string;
  title: string;
}

export async function findProductsPendingSend(): Promise<PendingSend[]> {
  const products = await prisma.product.findMany({
    where: {
      videoStatus: 'downloaded',
      whatsappStatus: { not: 'sent' },
      videoPath: { not: null },
      status: { not: 'discarded' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true },
  });
  return products.map((p) => ({ id: p.id, title: p.title }));
}

export async function startSendQueue(): Promise<QueueStartResult> {
  const pending = await findProductsPendingSend();
  const byId = new Map(pending.map((p) => [p.id, p]));

  return queueRunner.start(
    'send',
    pending.map((p) => p.id),
    async (productId) => {
      const item = byId.get(productId);
      scannerEvents.emit('info', `Fila de envio: "${item?.title || productId}"`);

      const result = await sendVideoOfProductToWhatsApp(productId);

      if (result.success) {
        await prisma.product
          .update({
            where: { id: productId },
            data: { whatsappStatus: 'sent', sentAt: new Date() },
          })
          .catch(() => {});
        return { success: true };
      }

      await prisma.product
        .update({ where: { id: productId }, data: { whatsappStatus: 'failed' } })
        .catch(() => {});

      return { success: false, error: result.error };
    }
  );
}
