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

const sendQueueModule = vi.hoisted(() => ({
  startSendQueue: vi.fn(),
}));

vi.mock('@/lib/queue/runner', () => queueModule);
vi.mock('@/lib/queue/send-queue', () => sendQueueModule);

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

const RUNNING = { ...IDLE, kind: 'send', status: 'running', total: 4, processed: 1 };

describe('POST /api/queue/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueModule.queueRunner.isRunning.mockReturnValue(false);
    queueModule.queueRunner.getState.mockReturnValue(IDLE);
    (scannerEvents.getIsScanning as ReturnType<typeof vi.fn>).mockReturnValue(false);
    sendQueueModule.startSendQueue.mockResolvedValue({ ok: true });
  });

  it('inicia a fila de envio e devolve o estado', async () => {
    queueModule.queueRunner.getState.mockReturnValue(RUNNING);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.queue.kind).toBe('send');
    expect(data.queue.total).toBe(4);
    expect(sendQueueModule.startSendQueue).toHaveBeenCalled();
  });

  it('recusa com 409 quando já existe uma fila em andamento', async () => {
    queueModule.queueRunner.isRunning.mockReturnValue(true);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain('andamento');
    expect(sendQueueModule.startSendQueue).not.toHaveBeenCalled();
  });

  it('recusa com 409 durante uma varredura da Shopee', async () => {
    (scannerEvents.getIsScanning as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain('varredura');
    expect(sendQueueModule.startSendQueue).not.toHaveBeenCalled();
  });

  it('devolve 400 quando não há vídeo para enviar', async () => {
    sendQueueModule.startSendQueue.mockResolvedValue({
      ok: false,
      error: 'Nenhum produto elegível para a fila.',
    });

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Nenhum produto');
  });
});
