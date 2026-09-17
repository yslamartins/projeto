import { describe, it, expect, vi } from 'vitest';
import {
  mapApiItemToRawCard,
  fetchSearchItems,
  buildApiSalesMap,
  enrichRawCardsWithApiSales,
} from './api-search';
import { parseProductCard } from './product-card-parser';

describe('api-search (fallback JSON interno da Shopee)', () => {
  it('should map item_basic into a raw product card', () => {
    const item = {
      item_basic: {
        itemid: '56417737763',
        shopid: '1922075475',
        name: 'Projetor Galaxy Starry Sky Night Light',
        price_max: 19990000,
        historical_sold: 120,
        image: 'cn-11134207-820l4-xxx',
      },
    };

    const raw = mapApiItemToRawCard(item);

    expect(raw).not.toBeNull();
    expect(raw?.rawHref).toBe('https://shopee.com.br/product/1922075475/56417737763');
    expect(raw?.rawTitle).toBe('Projetor Galaxy Starry Sky Night Light');
    expect(raw?.rawPrice).toBe('R$ 199,90');
    expect(raw?.rawSalesText).toBe('120 vendidos');
    expect(raw?.rawImageUrl).toBe(
      'https://down-br.img.susercontent.com/file/cn-11134207-820l4-xxx'
    );
  });

  it('should produce an eligible candidate through parseProductCard', () => {
    const item = {
      item_basic: {
        itemid: '56417737763',
        shopid: '1922075475',
        name: 'Projetor X',
        price_max: 5000000,
        historical_sold: 5,
        image: 'a.jpg',
      },
    };

    const raw = mapApiItemToRawCard(item)!;
    const candidate = parseProductCard(raw, new Set());

    expect(candidate).not.toBeNull();
    expect(candidate?.id).toBe('1922075475.56417737763');
    expect(candidate?.productUrl).toBe('https://shopee.com.br/product/1922075475/56417737763');
    expect(candidate?.salesCount).toBe(5);
    expect(candidate?.isEligible).toBe(true);
  });

  it('should ignore malformed items', () => {
    expect(mapApiItemToRawCard({ item_basic: {} })).toBeNull();
    expect(mapApiItemToRawCard(null)).toBeNull();
    expect(mapApiItemToRawCard({ item_basic: { name: 'x' } })).toBeNull();
  });

  it('should surface gated when the API answers the anti-bot error', async () => {
    const page = {
      evaluate: vi.fn(async () => ({ gated: true, items: [] })),
    } as any;

    const result = await fetchSearchItems(page, 'Projetor', 30);

    expect(result.gated).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('should pass through items from a successful API call', async () => {
    const items = [{ item_basic: { itemid: '1', shopid: '2', name: 'a' } }];
    const page = {
      evaluate: vi.fn(async () => ({ gated: false, items })),
    } as any;

    const result = await fetchSearchItems(page, 'Projetor', 30);

    expect(result.items).toHaveLength(1);
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), {
      term: 'Projetor',
      limit: 30,
    });
  });
});

describe('buildApiSalesMap', () => {
  it('indexa vendas por <shopid>.<itemid> usando historical_sold (item_basic)', () => {
    const map = buildApiSalesMap([
      { item_basic: { itemid: '111', shopid: '222', historical_sold: 120 } },
      { item_basic: { itemid: '333', shopid: '444', historical_sold: 8 } },
    ]);
    expect(map.get('222.111')).toBe(120);
    expect(map.get('444.333')).toBe(8);
  });

  it('aceita itens sem item_basic (dados diretos) e sold', () => {
    const map = buildApiSalesMap([{ itemid: '1', shopid: '2', sold: 15 }]);
    expect(map.get('2.1')).toBe(15);
  });

  it('ignora itens sem id ou com vendas 0', () => {
    const map = buildApiSalesMap([
      { item_basic: { itemid: '1', shopid: '2', historical_sold: 0 } },
      { item_basic: { name: 'x' } },
    ]);
    expect(map.size).toBe(0);
  });
});

describe('enrichRawCardsWithApiSales', () => {
  it('preenche rawSalesText de cards do DOM que nasceram sem contador', () => {
    const cards = [
      {
        rawHref: 'https://shopee.com.br/product/222/111',
        rawTitle: 'Projetor X',
        rawPrice: 'R$ 99,90',
        rawSalesText: '',
      },
    ];
    const map = buildApiSalesMap([
      { item_basic: { itemid: '111', shopid: '222', historical_sold: 250 } },
    ]);

    const enriched = enrichRawCardsWithApiSales(cards, map);
    expect(enriched[0].rawSalesText).toBe('250 vendidos');
  });

  it('não sobrescreve cards que já têm contador e ignora sem match', () => {
    const cards = [
      { rawHref: 'https://shopee.com.br/product/2/1', rawTitle: 'A', rawPrice: '', rawSalesText: '10 vendidos' },
      { rawHref: 'https://shopee.com.br/product/2/999', rawTitle: 'B', rawPrice: '', rawSalesText: '' },
    ];
    const map = buildApiSalesMap([{ item_basic: { itemid: '1', shopid: '2', historical_sold: 50 } }]);

    const enriched = enrichRawCardsWithApiSales(cards, map);
    expect(enriched[0].rawSalesText).toBe('10 vendidos');
    expect(enriched[1].rawSalesText).toBe('');
  });

  it('produz candidato elegível quando o DOM não tem vendas mas a API sim', () => {
    const card = {
      rawHref: 'https://shopee.com.br/product/222/111',
      rawTitle: 'Projetor X',
      rawPrice: 'R$ 99,90',
      rawSalesText: '',
    };
    const map = buildApiSalesMap([
      { item_basic: { itemid: '111', shopid: '222', historical_sold: 40 } },
    ]);

    const candidate = parseProductCard(enrichRawCardsWithApiSales([card], map)[0], new Set());
    expect(candidate).not.toBeNull();
    expect(candidate?.salesCount).toBe(40);
    expect(candidate?.isEligible).toBe(true);
  });
});