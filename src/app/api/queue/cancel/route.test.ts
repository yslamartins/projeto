import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueModule = vi.hoisted(() => ({
  queueRunner: {
    isRunning: vi.fn(),
    getState: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('@/lib/queue/runner', () => queueModule);

import { POST } from './route';

const IDLE = {
  kind: null,
  status: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  currentProductId: null,
};

describe('POST /api/queue/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueModule.queueRunner.getState.mockReturnValue(IDLE);
  });

  it('cancela a fila em andamento', async () => {
    queueModule.queueRunner.cancel.mockReturnValue({ ok: true });
    queueModule.queueRunner.getState.mockReturnValue({ ...IDLE, status: 'cancelling', kind: 'download' });

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.queue.status).toBe('cancelling');
  });

  it('devolve 400 quando não há fila para parar', async () => {
    queueModule.queueRunner.cancel.mockReturnValue({
      ok: false,
      error: 'Nenhuma fila em andamento.',
    });

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Nenhuma fila');
  });
});
