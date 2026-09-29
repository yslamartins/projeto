import { describe, it, expect } from 'vitest';
import { parseProductCard } from './product-card-parser';

describe('parseProductCard (TDD Seam)', () => {
  it('should parse valid card with canonical URL and mark as eligible when sales >= 1 and not in database', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/Projetor-Portatil-5G-Wifi-Android-i.12345678.98765432?sp_atk=abc123xyz',
      rawTitle: 'Projetor Portatil 5G Wifi Android Full HD',
      rawPrice: '289,90',
      rawSalesText: '15 vendidos',
      rawImageUrl: 'https://down-br.img.susercontent.com/file/br-111.jpg',
    };

    const existingIds = new Set<string>(['999999.888888']);

    const result = parseProductCard(rawCard, existingIds);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('12345678.98765432');
    expect(result?.productUrl).toBe('https://shopee.com.br/Projetor-Portatil-5G-Wifi-Android-i.12345678.98765432');
    expect(result?.title).toBe('Projetor Portatil 5G Wifi Android Full HD');
    expect(result?.price).toBe('R$ 289,90');
    expect(result?.salesCount).toBe(15);
    expect(result?.imageUrl).toBe('https://down-br.img.susercontent.com/file/br-111.jpg');
    expect(result?.isEligible).toBe(true);
  });

  it('should mark as not eligible when the card has no sales counter', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/Mouse-Sem-Fio-Optico-i.111222.333444',
      rawTitle: 'Mouse Sem Fio Optico 2.4Ghz',
      rawPrice: 'R$ 19,90',
      rawSalesText: '',
    };

    const result = parseProductCard(rawCard, new Set());
    expect(result).not.toBeNull();
    expect(result?.salesCount).toBe(0);
    expect(result?.isEligible).toBe(false);
  });

  it('should mark as not eligible when product is already in database (deduplication)', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/Capa-Chuva-Moto-i.555666.777888',
      rawTitle: 'Capa de Chuva Impermeavel Motoqueiro',
      rawPrice: 'R$ 89,00',
      rawSalesText: '120 vendidos',
    };

    const existingIds = new Set<string>(['555666.777888']);
    const result = parseProductCard(rawCard, existingIds);

    expect(result).not.toBeNull();
    expect(result?.salesCount).toBe(120);
    expect(result?.isEligible).toBe(false);
  });

  it('should return null when href is not a valid Shopee product URL', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/m/campanha-promocional-frete-gratis',
      rawTitle: 'Banner Promocional',
      rawPrice: 'R$ 0,00',
      rawSalesText: '',
    };

    const result = parseProductCard(rawCard, new Set());
    expect(result).toBeNull();
  });

  it('should normalize relative URLs to absolute https://shopee.com.br URLs', () => {
    const rawCard = {
      rawHref: '/Lembrancinha-Dia-dos-Professores-Caneca-i.999000.111222?sp_atk=123',
      rawTitle: 'Lembrancinha Professores Caneca',
      rawPrice: 'R$ 14,90',
      rawSalesText: '25 vendidos',
    };

    const result = parseProductCard(rawCard, new Set());
    expect(result).not.toBeNull();
    expect(result?.productUrl).toBe('https://shopee.com.br/Lembrancinha-Dia-dos-Professores-Caneca-i.999000.111222');
    expect(result?.id).toBe('999000.111222');
    expect(result?.isEligible).toBe(true);
  });

  it('should parse /product/<shopId>/<itemId> cards and mark as eligible when sales >= 1', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/product/300581799/22684694938?sp_atk=abc123',
      rawTitle: 'Caixa De Som Bluetooth Portatil',
      rawPrice: 'R$ 199,90',
      rawSalesText: '120 vendidos',
      rawImageUrl: 'https://down-br.img.susercontent.com/file/br-222.jpg',
    };

    const result = parseProductCard(rawCard, new Set());

    expect(result).not.toBeNull();
    expect(result?.id).toBe('300581799.22684694938');
    expect(result?.productUrl).toBe('https://shopee.com.br/product/300581799/22684694938');
    expect(result?.title).toBe('Caixa De Som Bluetooth Portatil');
    expect(result?.price).toBe('R$ 199,90');
    expect(result?.salesCount).toBe(120);
    expect(result?.isEligible).toBe(true);
  });

  it('should mark /product/ card as not eligible when already in database (dedup)', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/product/300581799/22684694938',
      rawTitle: 'Caixa De Som Bluetooth Portatil',
      rawPrice: 'R$ 199,90',
      rawSalesText: '120 vendidos',
    };

    const existingIds = new Set<string>(['300581799.22684694938']);
    const result = parseProductCard(rawCard, existingIds);

    expect(result).not.toBeNull();
    expect(result?.salesCount).toBe(120);
    expect(result?.isEligible).toBe(false);
  });

  it('should parse shopid/itemid query param cards as eligible when sales >= 1', () => {
    const rawCard = {
      rawHref: 'https://shopee.com.br/item?sp_atk=abc&shopid=401525579&itemid=22322311690',
      rawTitle: 'Sandalia Feminina Couro Legitimo',
      rawPrice: 'R$ 89,90',
      rawSalesText: '32 vendidos',
    };

    const result = parseProductCard(rawCard, new Set());

    expect(result).not.toBeNull();
    expect(result?.id).toBe('401525579.22322311690');
    expect(result?.productUrl).toBe('https://shopee.com.br/product/401525579/22322311690');
    expect(result?.isEligible).toBe(true);
  });
});
