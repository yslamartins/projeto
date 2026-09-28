import { NextResponse } from 'next/server';
import { scannerEvents } from '@/lib/scanner/events';
import { queueRunner } from '@/lib/queue/runner';
import { startSendQueue } from '@/lib/queue/send-queue';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (queueRunner.isRunning()) {
      return NextResponse.json(
        { success: false, error: 'Já existe uma fila em andamento.' },
        { status: 409 }
      );
    }

    if (scannerEvents.getIsScanning()) {
      return NextResponse.json(
        { success: false, error: 'Uma varredura da Shopee está em andamento.' },
        { status: 409 }
      );
    }

    const result = await startSendQueue();

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, queue: queueRunner.getState() });
  } catch (error: any) {
    console.error('Error starting send queue:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao iniciar a fila de envio' },
      { status: 500 }
    );
  }
}
