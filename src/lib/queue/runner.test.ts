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

import { QueueRunner, type QueueWorker } from './runner';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('QueueRunner', () => {
  let runner: QueueRunner;

  beforeEach(() => {
    runner = new QueueRunner();
  });

  it('processa os itens na ordem enfileirada, um por vez', async () => {
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const worker: QueueWorker = async (productId) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      order.push(productId);
      await settle();
      concurrent -= 1;
      return { success: true };
    };

    const start = runner.start('download', ['a', 'b', 'c'], worker);
    expect(start.ok).toBe(true);

    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxConcurrent).toBe(1);
  });

  it('contabiliza sucessos e falhas item a item', async () => {
    const worker: QueueWorker = async (productId) =>
      productId === 'b' ? { success: false, error: 'tikdrop bloqueou' } : { success: true };

    runner.start('download', ['a', 'b', 'c'], worker);
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    const state = runner.getState();
    expect(state.succeeded).toBe(2);
    expect(state.failed).toBe(1);
    expect(state.processed).toBe(3);
    expect(state.total).toBe(3);
  });

  it('um item que falha não interrompe os seguintes', async () => {
    const processed: string[] = [];
    const worker: QueueWorker = async (productId) => {
      processed.push(productId);
      if (productId === 'a') return { success: false, error: 'login necessário' };
      return { success: true };
    };

    runner.start('download', ['a', 'b', 'c'], worker);
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    expect(processed).toEqual(['a', 'b', 'c']);
    expect(runner.getState().succeeded).toBe(2);
  });

  it('um item que estoura exceção também não derruba a fila', async () => {
    const processed: string[] = [];
    const worker: QueueWorker = async (productId) => {
      processed.push(productId);
      if (productId === 'a') throw new Error('estourou');
      return { success: true };
    };

    runner.start('download', ['a', 'b'], worker);
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    expect(processed).toEqual(['a', 'b']);
    expect(runner.getState().failed).toBe(1);
    expect(runner.getState().succeeded).toBe(1);
  });

  it('cancelar impede os itens restantes mas libera a fila', async () => {
    const processed: string[] = [];
    const worker: QueueWorker = async (productId) => {
      processed.push(productId);
      if (productId === 'a') {
        const cancel = runner.cancel();
        expect(cancel.ok).toBe(true);
        expect(runner.getState().status).toBe('cancelling');
      }
      return { success: true };
    };

    runner.start('download', ['a', 'b', 'c'], worker);
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    expect(processed).toEqual(['a']);
    expect(runner.getState().status).toBe('idle');
    expect(runner.getState().succeeded).toBe(1);
  });

  it('recusa uma segunda fila enquanto a primeira roda', async () => {
    const worker: QueueWorker = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { success: true };
    };

    expect(runner.start('download', ['a'], worker).ok).toBe(true);
    const second = runner.start('send', ['b'], worker);

    expect(second.ok).toBe(false);
    expect(second.error).toContain('andamento');

    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
    expect(runner.start('send', ['b'], async () => ({ success: true })).ok).toBe(true);
  });

  it('recusa iniciar com a lista vazia', () => {
    const result = runner.start('download', [], async () => ({ success: true }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nenhum produto');
    expect(runner.isRunning()).toBe(false);
  });

  it('recusa cancelar sem fila em andamento', () => {
    const result = runner.cancel();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nenhuma fila');
  });

  it('libera a trava mesmo se o worker falhar', async () => {
    runner.start('download', ['a'], async () => {
      throw new Error('boom');
    });
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
    expect(runner.getState().status).toBe('idle');
    expect(runner.getState().failed).toBe(1);
  });
});
