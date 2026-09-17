import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchTikTokVideo } from '@/lib/scanner/tiktok-search';
import { buildTikTokSearchTerm } from '@/lib/scanner/tiktok-relevance';

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

    const term = buildTikTokSearchTerm(product.title?.trim() || '') || product.searchTerm?.trim();
    if (!term) {
      return NextResponse.json(
        { success: false, error: 'Produto sem nome/termo para buscar no TikTok' },
        { status: 400 }
      );
    }

    const result = await searchTikTokVideo({
      term,
      headful: Boolean(headful),
    });

    if (!result.success || !result.videoUrl) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Falha ao buscar vídeo no TikTok',
      });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        tikTokUrl: result.videoUrl,
        videoStatus: 'searched',
      },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    console.error('Error searching video:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao buscar vídeo' },
      { status: 500 }
    );
  }
}