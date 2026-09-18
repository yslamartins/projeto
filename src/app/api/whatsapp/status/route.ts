import { NextResponse } from 'next/server';
import { getWhatsAppState } from '@/lib/whatsapp/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ state: getWhatsAppState() });
}
