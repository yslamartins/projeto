import { prisma } from '@/lib/prisma';
import { scannerEvents } from '@/lib/scanner/events';
import { queueRunner, type QueueStartResult } from './runner';
import { runVideoDownload, runVideoPipeline } from '@/lib/video/pipeline';

// Pausa humanizada entre itens para não martelar o TikTok e o TikDrop em
// sequência. `SCRAPLING_TEST_FAST=1` zera a espera (mesmo hábito do engine da
// varredura).
function humanPauseBetweenItems(): number {
  if (process.env.SCRAPLING_TEST_FAST === '1') return 0;
  return 2000 + Math.floor(Math.random() * 4000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PendingDownload {
  id: string;
  title: string;
  hasTikTokUrl: boolean;
}

export async function findProductsPendingDownload(): Promise<PendingDownload[]> {
  const products = await prisma.product.findMany({
    where: {
      videoStatus: { not: 'downloaded' },
      status: { not: 'discarded' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, tikTokUrl: true },
  });
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    hasTikTokUrl: Boolean(p.tikTokUrl),
  }));
}

export async function startDownloadQueue(
  options: { headful?: boolean } = {}
): Promise<QueueStartResult> {
  const pending = await findProductsPendingDownload();
  const byId = new Map(pending.map((p) => [p.id, p]));

  return queueRunner.start(
    'download',
    pending.map((p) => p.id),
    async (productId, index) => {
      if (index > 0) {
        const pause = humanPauseBetweenItems();
        if (pause > 0) await sleep(pause);
      }

      const item = byId.get(productId);
      scannerEvents.emit('info', `Fila de download: "${item?.title || productId}"`);

      // Produto com URL do TikTok já guardada vai direto ao download.
      const result = item?.hasTikTokUrl
        ? await runVideoDownload({ productId, headful: options.headful })
        : await runVideoPipeline({ productId, headful: options.headful });

      return result.success ? { success: true } : { success: false, error: result.error };
    }
  );
}
