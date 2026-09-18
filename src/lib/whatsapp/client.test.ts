import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  let failInitialize = false;
  let remainingFails = 0;
  let clientOptions: any = null;
  return {
    handlers,
    getClientOptions: () => clientOptions,
    setClientOptions: (options: any) => {
      clientOptions = options;
    },
    setFailInitialize: (value: boolean) => {
      failInitialize = value;
    },
    setFailTimes: (value: number) => {
      remainingFails = value;
    },
    shouldFailInitialize: () => {
      if (remainingFails > 0) {
        remainingFails -= 1;
        return true;
      }
      return failInitialize;
    },
  };
});

vi.mock('whatsapp-web.js', () => {
  class FakeClient {
    initialize = vi.fn(async () => {
      if (testState.shouldFailInitialize()) {
        throw new Error('browser boom');
      }
      return undefined;
    });
    destroy = vi.fn(async () => {});
    on = vi.fn((event: string, listener: (...args: any[]) => void) => {
      const list = testState.handlers.get(event) ?? [];
      list.push(listener);
      testState.handlers.set(event, list);
      return this;
    });
    constructor(options: any) {
      testState.setClientOptions(options);
    }
  }
  return { Client: FakeClient, LocalAuth: class {} };
});

vi.mock('qrcode', () => ({
  __esModule: true,
  toDataURL: vi.fn(async (qr: string) => `data:image/png;base64,${qr}`),
  toString: vi.fn((_qr: string, _options: unknown, cb: (err: Error | null, out: string) => void) =>
    cb(null, 'QR-ASCII')
  ),
}));

import {
  ensureWhatsAppSession,
  getWhatsAppState,
  requestWhatsAppQr,
  resetWhatsAppSessionForTests,
} from './client';
import { scannerEvents } from '@/lib/scanner/events';

function emitEvent(event: string, ...args: any[]) {
  for (const listener of testState.handlers.get(event) ?? []) {
    listener(...args);
  }
}

function nextTick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetWhatsAppSessionForTests();
  testState.handlers.clear();
  testState.setFailTimes(0);
});

describe('ensureWhatsAppSession', () => {
  it('inicializa um cliente e retorna a mesma instância em chamadas seguintes', async () => {
    const client1 = await ensureWhatsAppSession();
    const client2 = await ensureWhatsAppSession();
    expect(client1).toBe(client2);
  });

  it('abre o WhatsApp Web em Chrome visível por padrão', async () => {
    await ensureWhatsAppSession();
    expect(testState.getClientOptions()).toMatchObject({
      puppeteer: { headless: false },
    });
  });

  it('transita para disconnected quando a inicialização falha', async () => {
    testState.setFailInitialize(true);
    await expect(ensureWhatsAppSession()).rejects.toThrow();
    expect(getWhatsAppState()).toBe('disconnected');

    testState.setFailInitialize(false);
    const client = await ensureWhatsAppSession();
    expect(client).toBeTruthy();
  });

  it('tenta de novo quando a primeira inicialização falha de forma transitória', async () => {
    testState.setFailTimes(1);
    const client = await ensureWhatsAppSession();
    expect(client).toBeTruthy();
    expect(getWhatsAppState()).toBe('disconnected');
  });
});

describe('eventos de conexão', () => {
  it('qr → waiting_qr com data URL da imagem', () => {
    const pending = requestWhatsAppQr().then((result) => result);
    return nextTick().then(() => {
      emitEvent('qr', 'RAW_QR_CODE');
      return pending.then((result) => {
        expect(getWhatsAppState()).toBe('waiting_qr');
        expect(result).toEqual({
          state: 'waiting_qr',
          qr: 'data:image/png;base64,RAW_QR_CODE',
        });
      });
    });
  });

  it('qr emite logs SSE informando que o QR está disponível', () => {
    const emitSpy = vi.spyOn(scannerEvents, 'emit');
    const pending = requestWhatsAppQr();
    return nextTick().then(() => {
      emitEvent('qr', 'RAW_QR_CODE');
      return pending.then(() => {
        const calls = emitSpy.mock.calls;
        expect(calls.some(([type, message]) => type === 'step' && message.includes('escaneie'))).toBe(
          true
        );
        expect(calls.some(([type, , data]) => type === 'info' && data?.qrAvailable === true)).toBe(
          true
        );
      });
    });
  });

  it('ready emite log SSE de sucesso', () => {
    const emitSpy = vi.spyOn(scannerEvents, 'emit');
    const pending = requestWhatsAppQr();
    return nextTick().then(() => {
      emitEvent('ready');
      return pending.then(() => {
        expect(
          emitSpy.mock.calls.some(([type, message]) => type === 'success' && message.includes('conectado'))
        ).toBe(true);
      });
    });
  });

  it('authenticated → connecting, ready → connected', () => {
    const pending = requestWhatsAppQr().then((result) => result);
    return nextTick()
      .then(() => {
        emitEvent('qr', 'RAW_QR_CODE');
        expect(getWhatsAppState()).toBe('waiting_qr');
        emitEvent('authenticated');
        expect(getWhatsAppState()).toBe('connecting');
        emitEvent('ready');
        expect(getWhatsAppState()).toBe('connected');
        return pending;
      })
      .then((result) => {
        expect(result).toEqual({ state: 'connected', qr: null });
      });
  });

  it('ready limpa o QR atual', async () => {
    const pending = requestWhatsAppQr();
    await nextTick();
    emitEvent('qr', 'RAW_QR_CODE');
    emitEvent('ready');
    const result = await pending;
    expect(result.qr).toBeNull();
  });

  it('disconnected volta para disconnected e libera a sessão para nova tentativa', async () => {
    const first = await ensureWhatsAppSession();
    emitEvent('disconnected', 'LOGOUT');
    await nextTick();
    expect(getWhatsAppState()).toBe('disconnected');

    const second = await ensureWhatsAppSession();
    expect(second).not.toBe(first);
  });

  it('auth_failure volta para disconnected e permite nova tentativa com outro cliente', async () => {
    const first = await ensureWhatsAppSession();
    emitEvent('auth_failure', 'Invalid key');
    await nextTick();
    expect(getWhatsAppState()).toBe('disconnected');

    const second = await ensureWhatsAppSession();
    expect(second).not.toBe(first);
  });
});

describe('requestWhatsAppQr', () => {
  it('retorna qr null se o QR não chegar dentro do timeout', async () => {
    const result = await requestWhatsAppQr(50);
    expect(result.qr).toBeNull();
  });
});
