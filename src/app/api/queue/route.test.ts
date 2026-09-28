import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueModule = vi.hoisted(() => ({
  queueRunner: {
    isRunning: vi.fn(),
    getState: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('@/lib/queue/runner', () => queueModule);

import { GET } from './route';

const IDLE = {
  kind: null,
  status: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  currentProductId: null,
};

describe('GET /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve o estado ocioso de uma fila que nunca rodou', async () => {
    queueModule.queueRunner.getState.mockReturnValue(IDLE);

    const res = await GET();
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.queue).toEqual(IDLE);
  });

  it('devolve o progresso de qualquer tipo de fila em andamento', async () => {
    queueModule.queueRunner.getState.mockReturnValue({
      ...IDLE,
      kind: 'send',
      status: 'running',
      total: 4,
      processed: 2,
      succeeded: 2,
      failed: 0,
    });

    const res = await GET();
    const data = await res.json();

    expect(data.queue.kind).toBe('send');
    expect(data.queue.processed).toBe(2);
  });
});
