import { NextResponse } from 'next/server';
import { openShopeeSession } from '@/lib/scanner/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await openShopeeSession();
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao abrir navegador' },
      { status: 500 }
    );
  }
}
