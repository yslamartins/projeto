import { NextResponse } from 'next/server';
import { queueRunner } from '@/lib/queue/runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, queue: queueRunner.getState() });
}
