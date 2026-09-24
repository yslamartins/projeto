import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

import { runCollect, runCollectSession, COLLECT_SCRIPT } from './spawn-driver';
import { scannerEvents } from './events';
import type { ScanLogEvent } from '@/types/product';

function fakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

function feed(child: any, lines: string[]) {
  child.stdout.write(Buffer.from(lines.join('\n') + '\n'));
}

describe('spawn-driver', () => {
  let captured: ScanLogEvent[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    spawnMock.mockReset();
    captured = [];
    scannerEvents.clear();
    unsubscribe = scannerEvents.subscribe((e) => captured.push(e));
  });

  afterEach(() => unsubscribe());

  it('repassa logs JSONL ao scannerEvents e resolve o resultado', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runCollect<{ cards: number[] }>({ args: ['shopee', 'search', '--term', 'x'] });
    feed(child, [
      '{"t":"log","level":"step","message":"Pesquisando"}',
      '{"t":"log","level":"info","message":"Cards: 2"}',
      '{"t":"result","ok":true,"data":{"cards":[1,2]}}',
    ]);
    child.emit('close', 0);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.data).toEqual({ cards: [1, 2] });
    expect(captured.map((e) => [e.type, e.message])).toEqual([
      ['step', 'Pesquisando'],
      ['info', 'Cards: 2'],
    ]);
  });

  it('usa o script do collect.py como alvo do subprocesso', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    runCollect({ args: ['shopee', 'ping'] });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      [COLLECT_SCRIPT, 'shopee', 'ping'],
      expect.any(Object)
    );
  });

  it('resultado ok:false vira erro com a mensagem do driver', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runCollect<unknown>({ args: ['shopee', 'search', '--term', 'x'] });
    feed(child, ['{"t":"result","ok":false,"error":"Shopee exibiu verificação de segurança"}']);
    child.emit('close', 1);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('verificação de segurança');
    expect(outcome.exitCode).toBe(1);
  });

  it('spawn com falha (ex.: python ausente) resolve com erro sem exitCode', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const promise = runCollect<unknown>({ args: ['shopee', 'terms'] });
    child.emit('error', new Error('ENOENT'));
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('Falha ao iniciar');
    expect(outcome.exitCode).toBeNull();
  });

  it('encerramento sem linha result reporta o último erro do stderr', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const promise = runCollect<unknown>({ args: ['shopee', 'terms'] });
    child.stderr.write(Buffer.from('Traceback...\n'));
    child.emit('close', 1);
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('Traceback');
    expect(captured.filter((e) => e.type === 'error')).toHaveLength(1);
  });

  it('runCollectSession não aguarda o encerramento e emite logs', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { child: spawned } = runCollectSession({ args: ['shopee', 'session'] });
    feed(child, ['{"t":"log","level":"success","message":"Shopee aberto!"}']);
    expect(spawned).toBe(child);
    expect(captured.some((e) => e.message === 'Shopee aberto!')).toBe(true);
  });
});