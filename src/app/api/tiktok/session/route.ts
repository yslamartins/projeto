import { NextResponse } from 'next/server';
import { openTikTokSession } from '@/lib/scanner/tiktok-search';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await openTikTokSession();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error opening TikTok session:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao abrir TikTok' },
      { status: 500 }
    );
  }
}