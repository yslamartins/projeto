import { NextResponse } from 'next/server';
import { queueRunner } from '@/lib/queue/runner';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = queueRunner.cancel();
  return NextResponse.json(
    { success: result.ok, error: result.error, queue: queueRunner.getState() },
    { status: result.ok ? 200 : 400 }
  );
}
