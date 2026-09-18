import { NextRequest, NextResponse } from 'next/server';
import { requestWhatsAppQr } from '@/lib/whatsapp/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const result = await requestWhatsAppQr();

    if (result.qr && new URL(request.url).searchParams.get('format') !== 'json') {
      const base64 = result.qr.replace(/^data:[a-zA-Z0-9+./-]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Falha ao obter o QR do WhatsApp';
    return NextResponse.json(
      { state: 'disconnected', qr: null, error: message },
      { status: 500 }
    );
  }
}