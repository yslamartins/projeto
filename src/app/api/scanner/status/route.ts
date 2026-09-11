import { NextResponse } from 'next/server';
import { scannerEvents } from '@/lib/scanner/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    isScanning: scannerEvents.getIsScanning(),
  });
}
