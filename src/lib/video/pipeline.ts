import { prisma } from '@/lib/prisma';
import { searchTikTokVideo } from '@/lib/scanner/tiktok-search';
import { buildTikTokSearchTerm } from '@/lib/scanner/tiktok-relevance';
import { downloadTikTokVideo } from '@/lib/tikdrop/download';
import { scannerEvents } from '@/lib/scanner/events';

export type VideoFailure = 'not_found' | 'missing_term' | 'missing_tikTok_url' | 'search' | 'download';

export type VideoStep = 'search' | 'download';

export interface VideoResult {
  success: boolean;
  failure?: VideoFailure;
  step?: VideoStep;
  error?: string;
  product?: Awaited<ReturnType<typeof prisma.product.update>>;
}

export interface RunVideoOptions {
  productId: string;
  headful?: boolean;
}

/**
 * Baixa o MP4 do produto e grava o resultado. Marca `videoStatus` como `failed`
 * quando o download falha. Não emite logs: quem chama decide o que dizer, para
 * que a rota e a fila possam falar com palavras diferentes.
 */
async function downloadAndStore(
  productId: string,
  tikTokUrl: string,
  headful: boolean
): Promise<VideoResult> {
  const downloadResult = await downloadTikTokVideo({
    tikTokUrl,
    productId,
    headful,
  });

  if (!downloadResult.success) {
    await prisma.product
      .update({ where: { id: productId }, data: { videoStatus: 'failed' } })
      .catch(() => {});
    return {
      success: false,
      failure: 'download',
      step: 'download',
      error: downloadResult.error || 'Falha ao baixar vídeo',
    };
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      videoUrl: downloadResult.videoUrl,
      videoPath: downloadResult.videoPath,
      videoStatus: 'downloaded',
    },
  });

  return { success: true, product: updated };
}

/** Busca um vídeo relevante no TikTok e baixa em HD. Busca + download. */
export async function runVideoPipeline(options: RunVideoOptions): Promise<VideoResult> {
  const { productId, headful } = options;
  const headfulBool = Boolean(headful);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { success: false, failure: 'not_found', error: 'Produto não encontrado' };
  }

  const term = buildTikTokSearchTerm(product.title?.trim() || '') || product.searchTerm?.trim();
  if (!term) {
    return { success: false, failure: 'missing_term', error: 'Produto sem termo para busca' };
  }

  scannerEvents.emit('step', `Pipeline: buscando vídeo no TikTok para "${term}"...`);

  const searchResult = await searchTikTokVideo({ term, headful: headfulBool });

  if (!searchResult.success || !searchResult.videoUrl) {
    await prisma.product
      .update({ where: { id: productId }, data: { videoStatus: 'failed' } })
      .catch(() => {});
    scannerEvents.emit('error', `Pipeline falhou na busca: ${searchResult.error}`);
    return {
      success: false,
      failure: 'search',
      step: 'search',
      error: searchResult.error,
    };
  }

  const withTikTokUrl = await prisma.product.update({
    where: { id: productId },
    data: { tikTokUrl: searchResult.videoUrl, videoStatus: 'searched' },
  });
  scannerEvents.emit('success', 'TikTok: vídeo encontrado e salvo. Prosseguindo para download...');

  scannerEvents.emit('step', 'Pipeline: iniciando download via TikDrop...');

  const downloaded = await downloadAndStore(withTikTokUrl.id, searchResult.videoUrl, headfulBool);
  if (!downloaded.success) {
    scannerEvents.emit('error', `Pipeline falhou no download: ${downloaded.error}`);
    return downloaded;
  }

  scannerEvents.emit('success', 'Pipeline concluído! Vídeo salvo no disco para o produto.');

  return { success: true, product: downloaded.product! };
}

/** Baixa em HD o vídeo de um produto que já tem a URL do TikTok guardada. */
export async function runVideoDownload(options: RunVideoOptions): Promise<VideoResult> {
  const { productId, headful } = options;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { success: false, failure: 'not_found', error: 'Produto não encontrado' };
  }

  if (!product.tikTokUrl) {
    return {
      success: false,
      failure: 'missing_tikTok_url',
      error: 'Produto não possui URL do TikTok (busque antes)',
    };
  }

  const downloaded = await downloadAndStore(product.id, product.tikTokUrl, Boolean(headful));
  if (!downloaded.success) {
    return downloaded;
  }

  return { success: true, product: downloaded.product! };
}
