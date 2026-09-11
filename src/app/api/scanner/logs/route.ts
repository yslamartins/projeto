import { NextRequest } from 'next/server';
import { scannerEvents } from '@/lib/scanner/events';
import { ScanLogEvent } from '@/types/product';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keep-alive comment
      controller.enqueue(encoder.encode(': connected\n\n'));

      const unsubscribe = scannerEvents.subscribe((log: ScanLogEvent) => {
        try {
          const data = `data: ${JSON.stringify(log)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // If controller is closed, unsubscribe
          unsubscribe();
        }
      });

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
