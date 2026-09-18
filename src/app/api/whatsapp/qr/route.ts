import { NextResponse } from 'next/server';
import { requestWhatsAppQr } from '@/lib/whatsapp/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await requestWhatsAppQr();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { state: 'disconnected', qr: null, error: error.message || 'Falha ao obter o QR do WhatsApp' },
      { status: 500 }
    );
  }
}