import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { runCollectMock } = vi.hoisted(() => ({ runCollectMock: vi.fn() }));
const { prismaUpsertMock } = vi.hoisted(() => ({ prismaUpsertMock: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(async () => []),
      upsert: prismaUpsertMock,
    },
  },
}));

vi.mock('./spawn-driver', () => ({
  runCollect: runCollectMock,
  runCollectSession: vi.fn(),
}));

import { runShopeeScanner, REAL_SHOPEE_TRENDING_TERMS } from './engine';
import { scannerEvents } from './events';
import type { ScanLogEvent } from '@/types/product';

const eligibleCard = () => ({
  rawHref: 'https://shopee.com.br/product/1001/2001',
  rawTitle: 'Mouse Sem Fio Bluetooth',
  rawPrice: 'R$ 49,90',
  rawSalesText: '12 vendidos',
  rawImageUrl: '',
});

const lowSalesCard = () => ({
  rawHref: 'https://shopee.com.br/product/1001/2002',
  rawTitle: 'Mouse barato',
  rawPrice: 'R$ 9,90',
  rawSalesText: '2 vendidos',
  rawImageUrl: '',
});

function cards(defaultCard: () => any = eligibleCard, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...defaultCard(),
    rawHref: defaultCard().rawHref.replace('2001', String(2001 + i)),
  }));
}

function searchOutcome(overrides: Partial<any> = {}) {
  return { ok: true, data: { term: 'x', cards: [], count: 0, block: null, ...overrides }, exitCode: 0 };
}

function router(args: { args: string[] }) {
  const [site, action] = args.args;
  if (action === 'terms') {
    return Promise.resolve({ ok: true, data: { terms: ['Projetor', 'Mouse Sem Fio'], count: 2, source: 'mock' }, exitCode: 0 });
  }
  if (action === 'search') {
    return Promise.resolve(searchOutcome());
  }
  return Promise.resolve({ ok: false, error: `ação ${action} não mapeada`, exitCode: 1 });
}

describe('runShopeeScanner (driver via spawn)', () => {
  let captured: ScanLogEvent[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    process.env.SCRAPLING_TEST_FAST = '1';
    runCollectMock.mockReset();
    prismaUpsertMock.mockReset();
    prismaUpsertMock.mockImplementation(async ({ create }: any) => create);
    captured = [];
    scannerEvents.clear();
    unsubscribe = scannerEvents.subscribe((e) => captured.push(e));
  });

  afterEach(() => {
    delete process.env.SCRAPLING_TEST_FAST;
    unsubscribe();
    scannerEvents.setIsScanning(false);
  });

  it('salva produtos elegíveis (>= 5 vendas e novos) no banco', async () => {
runCollectMock.mockImplementation(({ args }: any) =>
      args.includes('--term')
        ? Promise.resolve(searchOutcome({ cards: cards(eligibleCard) }))
        : router({ args })
    );

    const result = await runShopeeScanner({ term: 'Mouse Sem Fio' });

    expect(result.success).toBe(true);
    expect(result.product).toHaveLength(3);
    expect(prismaUpsertMock).toHaveBeenCalledTimes(3);
    expect(captured.some((e) => e.message.includes('Varredura concluída: 3 produto(s)'))).toBe(true);
    expect(captured.some((e) => e.type === 'success' && e.message.includes('🎯'))).toBe(true);
  });

  it('respeita o limite de 10 elegíveis por termo', async () => {
    runCollectMock.mockImplementation(({ args }: any) =>
      args.includes('--term') ? Promise.resolve(searchOutcome({ cards: cards(undefined, 15) })) : router({ args })
    );

    const result = await runShopeeScanner({ term: 'Mouse Sem Fio' });
    expect(result.success).toBe(true);
    expect(prismaUpsertMock).toHaveBeenCalledTimes(10);
  });

  it('termo sem elegíveis: avisa e finaliza sem produtos', async () => {
    runCollectMock.mockImplementation(({ args }: any) =>
      args.includes('--term')
? Promise.resolve(searchOutcome({ cards: cards(lowSalesCard, 4) }))
          : router({ args })
    );

    const result = await runShopeeScanner({ term: 'Mouse barato' });
    expect(result.success).toBe(true);
    expect(result.product).toBeNull();
    expect(prismaUpsertMock).not.toHaveBeenCalled();
    expect(captured.some((e) => e.message.includes('Nenhum produto novo com >= 5 vendas'))).toBe(true);
  });

  it('termo com gate: reporta o erro e continua para o próximo termo', async () => {
    runCollectMock.mockImplementation(({ args }: any) => {
      if (args.includes('--term')) {
        const term = args[args.indexOf('--term') + 1];
        return Promise.resolve(
          term === 'Projetor'
            ? { ok: false, error: 'Shopee exibiu verificação de segurança e bloqueou esta varredura.', exitCode: 1 }
            : searchOutcome({ cards: cards() })
        );
      }
      return router({ args });
    });

    const result = await runShopeeScanner();
    // Sem termos no banco não há produto; mas a varredura NÃO abortou no gate
    expect(result.success).toBe(true);
    expect(captured.some((e) => e.type === 'error' && e.message.includes('verificação de segurança'))).toBe(true);
    // O primeiro termo "Projetor" quebrou, o segundo continuou
    expect(captured.some((e) => e.message.includes('Pesquisando "Mouse Sem Fio"'))).toBe(true);
  });

  it('falha do driver: reporta e segue adiante', async () => {
    runCollectMock.mockImplementation(({ args }: any) => {
      if (args.includes('--term')) {
        const term = args[args.indexOf('--term') + 1];
        return term === 'Projetor' ? Promise.reject(new Error('driver quebrou')) : Promise.resolve(searchOutcome({ cards: cards() }));
      }
      return router({ args });
    });

    const result = await runShopeeScanner();
    expect(result.success).toBe(true);
    expect(captured.some((e) => e.type === 'error' && e.message.includes('Erro ao pesquisar termo "Projetor"'))).toBe(true);
    expect(captured.some((e) => e.message.includes('Pesquisando "Mouse Sem Fio"'))).toBe(true);
  });

  it('driver de termos falha: usa a lista de fallback REAL_SHOPEE_TRENDING_TERMS', async () => {
    runCollectMock.mockImplementation(({ args }: any) => {
      if (args.includes('terms')) return Promise.resolve({ ok: false, error: 'driver offline', exitCode: 1 });
      return Promise.resolve(searchOutcome({ cards: [] }));
    });

    const result = await runShopeeScanner();
    expect(result.success).toBe(true);
    expect(captured.some((e) => e.message.includes('usando a lista de fallback'))).toBe(true);
    expect(runCollectMock.mock.calls.filter(([o]: any) => o.args[1] === 'terms')).toHaveLength(1);
    expect(REAL_SHOPEE_TRENDING_TERMS.length).toBeGreaterThan(0);
  });
});