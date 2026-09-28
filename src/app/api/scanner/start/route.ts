import { NextRequest, NextResponse } from 'next/server';
import { runShopeeScanner } from '@/lib/scanner/engine';
import { scannerEvents } from '@/lib/scanner/events';
import { queueRunner } from '@/lib/queue/runner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (scannerEvents.getIsScanning()) {
      return NextResponse.json(
        { success: false, error: 'Uma varredura já está em execução no momento.' },
        { status: 409 }
      );
    }

    if (queueRunner.isRunning()) {
      return NextResponse.json(
        { success: false, error: 'Uma fila de vídeos está em andamento.' },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { headful, term } = body;

    // Dispara a varredura assincronamente em background para responder imediatamente
    runShopeeScanner({
      headful: Boolean(headful),
      term: typeof term === 'string' ? term : undefined,
    }).catch((err) => {
      console.error('Unhandled scanner run error:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Varredura iniciada com sucesso.',
    });
  } catch (error: any) {
    console.error('Error starting scanner:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao iniciar varredura' },
      { status: 500 }
    );
  }
}
