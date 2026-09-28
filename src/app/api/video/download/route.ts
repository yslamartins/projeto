import { NextRequest, NextResponse } from 'next/server';
import { runVideoDownload } from '@/lib/video/pipeline';

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

    const result = await runVideoDownload({ productId, headful });

    if (!result.success) {
      if (result.failure === 'not_found') {
        return NextResponse.json({ success: false, error: result.error }, { status: 404 });
      }
      if (result.failure === 'missing_tikTok_url') {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: result.error });
    }

    return NextResponse.json({ success: true, product: result.product });
  } catch (error: any) {
    console.error('Error downloading video:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao baixar vídeo' },
      { status: 500 }
    );
  }
}
