import { describe, it, expect, vi } from 'vitest';
import { mapApiItemToRawCard, fetchSearchItems } from './api-search';
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