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

vi.mock('./sweep', () => ({
  sweepStaleSessionChrome: vi.fn(async () => 0),
}));


import {
  ensureWhatsAppSession,
  getWhatsAppState,
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
  delete process.env.WHATSAPP_HEADLESS;
});

describe('ensureWhatsAppSession', () => {
  it('inicializa um cliente e retorna a mesma instÃ¢ncia em chamadas seguintes', async () => {
    const client1 = await ensureWhatsAppSession();
    const client2 = await ensureWhatsAppSession();
    expect(client1).toBe(client2);
  });

  it('abre o Chrome visÃ­vel por padrÃ£o', async () => {
    await ensureWhatsAppSession();
    expect(testState.getClientOptions()).toMatchObject({
      puppeteer: { headless: false },
    });
  });

  it('oculta o Chrome quando WHATSAPP_HEADLESS=true', async () => {
    process.env.WHATSAPP_HEADLESS = 'true';
    await ensureWhatsAppSession();
    expect(testState.getClientOptions()).toMatchObject({
      puppeteer: { headless: true },
    });
  });

  it('transita para disconnected quando a inicializaÃ§Ã£o falha', async () => {
    testState.setFailInitialize(true);
    await expect(ensureWhatsAppSession()).rejects.toThrow();
    expect(getWhatsAppState()).toBe('disconnected');

    testState.setFailInitialize(false);
    const client = await ensureWhatsAppSession();
    expect(client).toBeTruthy();
  });

  it('tenta de novo quando a primeira inicializaÃ§Ã£o falha de forma transitÃ³ria', async () => {
    testState.setFailTimes(1);
    const client = await ensureWhatsAppSession();
    expect(client).toBeTruthy();
    expect(getWhatsAppState()).toBe('disconnected');
  });
});

describe('eventos de conexÃ£o', () => {
  it('qr → connecting e emite log SSE guiando para a janela do navegador', async () => {
    const emitSpy = vi.spyOn(scannerEvents, 'emit');
    const pending = ensureWhatsAppSession();
    await nextTick();
    emitEvent('qr', 'RAW_QR_CODE');
    expect(getWhatsAppState()).toBe('connecting');
    await pending;

    const calls = emitSpy.mock.calls;
    expect(
      calls.some(([type, message]) => type === 'step' && message.includes('escaneie o QR code na janela'))
    ).toBe(true);
  });

  it('ready emite log SSE de sucesso', async () => {
    const emitSpy = vi.spyOn(scannerEvents, 'emit');
    const pending = ensureWhatsAppSession();
    await nextTick();
    emitEvent('ready');
    await pending;
    expect(
      emitSpy.mock.calls.some(([type, message]) => type === 'success' && message.includes('conectado'))
    ).toBe(true);
  });

  it('qr/authenticated → connecting, ready → connected', async () => {
    const pending = ensureWhatsAppSession();
    await nextTick();
    emitEvent('qr', 'RAW_QR_CODE');
    expect(getWhatsAppState()).toBe('connecting');
    emitEvent('authenticated');
    expect(getWhatsAppState()).toBe('connecting');
    emitEvent('ready');
    expect(getWhatsAppState()).toBe('connected');
    await pending;
  });

  it('disconnected volta para disconnected e libera a sessÃ£o para nova tentativa', async () => {
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