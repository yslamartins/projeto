import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { downloadTikTokVideo } from '@/lib/ssstik/download';

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

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Produto não encontrado' },
        { status: 404 }
      );
    }

    if (!product.tikTokUrl) {
      return NextResponse.json(
        { success: false, error: 'Produto não possui URL do TikTok (busque antes)' },
        { status: 400 }
      );
    }

    const result = await downloadTikTokVideo({
      tikTokUrl: product.tikTokUrl,
      productId: product.id,
      headful: Boolean(headful),
    });

    if (!result.success) {
      await prisma.product
        .update({ where: { id: productId }, data: { videoStatus: 'failed' } })
        .catch(() => {});
      return NextResponse.json({
        success: false,
        error: result.error || 'Falha ao baixar vídeo',
      });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        videoUrl: result.videoUrl,
        videoPath: result.videoPath,
        videoStatus: 'downloaded',
      },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    console.error('Error downloading video:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao baixar vídeo' },
      { status: 500 }
    );
  }
}