import { NextRequest, NextResponse } from 'next/server';
import { runVideoPipeline, type VideoResult } from '@/lib/video/pipeline';
import { scannerEvents } from '@/lib/scanner/events';
import { queueRunner } from '@/lib/queue/runner';

export const dynamic = 'force-dynamic';

function failedResponse(result: VideoResult) {
  if (result.failure === 'not_found') {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  if (result.failure === 'missing_term') {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: false, step: result.step, error: result.error });
}

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

    if (queueRunner.isRunning()) {
      return NextResponse.json(
        { success: false, error: 'Uma fila de vídeos está em andamento.' },
        { status: 409 }
      );
    }

    const result = await runVideoPipeline({ productId, headful });

    if (!result.success) {
      return failedResponse(result);
    }

    return NextResponse.json({ success: true, product: result.product });
  } catch (error: any) {
    console.error('Error in video pipeline:', error);
    scannerEvents.emit('error', `Erro inesperado no pipeline: ${error.message}`);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro no pipeline' },
      { status: 500 }
    );
  }
}
