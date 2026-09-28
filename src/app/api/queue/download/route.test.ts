import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/scanner/events', () => ({
  scannerEvents: {
    emit: vi.fn(),
    setVideoProcessing: vi.fn(),
    getVideoProcessing: vi.fn(),
    setIsScanning: vi.fn(),
    getIsScanning: vi.fn(),
  },
}));

const queueModule = vi.hoisted(() => ({
  queueRunner: {
    isRunning: vi.fn(),
    getState: vi.fn(),
    cancel: vi.fn(),
  },
}));

const downloadQueueModule = vi.hoisted(() => ({
  startDownloadQueue: vi.fn(),
}));

vi.mock('@/lib/queue/runner', () => queueModule);
vi.mock('@/lib/queue/download-queue', () => downloadQueueModule);

import { POST } from './route';
import { scannerEvents } from '@/lib/scanner/events';

const IDLE = {
  kind: null,
  status: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  currentProductId: null,
};

const RUNNING = { ...IDLE, kind: 'download', status: 'running', total: 3, processed: 1 };

async function callPost(body: unknown = {}) {
  const req = new Request('http://localhost/api/queue/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req as any);
}

describe('/api/queue/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueModule.queueRunner.isRunning.mockReturnValue(false);
    queueModule.queueRunner.getState.mockReturnValue(IDLE);
    (scannerEvents.getIsScanning as ReturnType<typeof vi.fn>).mockReturnValue(false);
    downloadQueueModule.startDownloadQueue.mockResolvedValue({ ok: true });
  });

  it('POST inicia a fila e devolve o estado', async () => {
    queueModule.queueRunner.getState.mockReturnValue(RUNNING);

    const res = await callPost({ headful: true });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.queue.total).toBe(3);
    expect(downloadQueueModule.startDownloadQueue).toHaveBeenCalledWith({ headful: true });
  });

  it('POST recusa com 409 quando já existe uma fila em andamento', async () => {
    queueModule.queueRunner.isRunning.mockReturnValue(true);

    const res = await callPost();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain('andamento');
    expect(downloadQueueModule.startDownloadQueue).not.toHaveBeenCalled();
  });

  it('POST recusa com 409 durante uma varredura da Shopee', async () => {
    (scannerEvents.getIsScanning as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await callPost();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain('varredura');
    expect(downloadQueueModule.startDownloadQueue).not.toHaveBeenCalled();
  });

  it('POST devolve 400 quando não há produto elegível', async () => {
    downloadQueueModule.startDownloadQueue.mockResolvedValue({
      ok: false,
      error: 'Nenhum produto elegível para a fila.',
    });

    const res = await callPost();
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Nenhum produto');
  });
});
