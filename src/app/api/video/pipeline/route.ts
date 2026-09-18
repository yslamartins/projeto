import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchTikTokVideo } from '@/lib/scanner/tiktok-search';
import { downloadTikTokVideo } from '@/lib/tikdrop/download';
import { scannerEvents } from '@/lib/scanner/events';
import { buildTikTokSearchTerm } from '@/lib/scanner/tiktok-relevance';
import { sendVideoAndLinkToGroup } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productId, headful } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId ausente' },
        { status: 400 }
      );
    }

    if (scannerEvents.getIsScanning() || scannerEvents.getVideoProcessing()) {
      return NextResponse.json(
        { success: false, error: 'Outra automação em andamento.' },
        { status: 409 }
      );
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Produto não encontrado' },
        { status: 404 }
      );
    }

    const term = buildTikTokSearchTerm(product.title?.trim() || '') || product.searchTerm?.trim();
    if (!term) {
      return NextResponse.json(
        { success: false, error: 'Produto sem termo para busca' },
        { status: 400 }
      );
    }

    const headfulBool = Boolean(headful);
    scannerEvents.emit('step', `Pipeline: buscando vídeo no TikTok para "${term}"...`);

    // ---------- ETAPA 1: BUSCA ----------
    const searchResult = await searchTikTokVideo({ term, headful: headfulBool });

    if (!searchResult.success || !searchResult.videoUrl) {
      await prisma.product
        .update({ where: { id: productId }, data: { videoStatus: 'failed' } })
        .catch(() => {});
      scannerEvents.emit(
        'error',
        `Pipeline falhou na busca: ${searchResult.error}`
      );
      return NextResponse.json({
        success: false,
        step: 'search',
        error: searchResult.error,
      });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { tikTokUrl: searchResult.videoUrl, videoStatus: 'searched' },
    });
    scannerEvents.emit(
      'success',
      `TikTok: vídeo encontrado e salvo. Prosseguindo para download...`
    );

    // ---------- ETAPA 2: DOWNLOAD ----------
    scannerEvents.emit('step', 'Pipeline: iniciando download via TikDrop...');
    const downloadResult = await downloadTikTokVideo({
      tikTokUrl: searchResult.videoUrl,
      productId: updatedProduct.id,
      headful: headfulBool,
    });

    if (!downloadResult.success) {
      await prisma.product
        .update({ where: { id: productId }, data: { videoStatus: 'failed' } })
        .catch(() => {});
      scannerEvents.emit(
        'error',
        `Pipeline falhou no download: ${downloadResult.error}`
      );
      return NextResponse.json({
        success: false,
        step: 'download',
        error: downloadResult.error,
      });
    }

    const finalProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        videoUrl: downloadResult.videoUrl,
        videoPath: downloadResult.videoPath,
        videoStatus: 'downloaded',
      },
    });

    scannerEvents.emit(
      'success',
      `Pipeline concluído! Vídeo salvo no disco para o produto.`
    );

    if (finalProduct.videoPath) {
      await sendVideoAndLinkToGroup(finalProduct, finalProduct.videoPath);
    }

    return NextResponse.json({ success: true, product: finalProduct });
  } catch (error: any) {
    console.error('Error in video pipeline:', error);
    scannerEvents.emit('error', `Erro inesperado no pipeline: ${error.message}`);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro no pipeline' },
      { status: 500 }
    );
  }
}