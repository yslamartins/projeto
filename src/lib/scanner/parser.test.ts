import { describe, it, expect } from 'vitest';
import {
  parseSalesCount,
  extractShopeeProductId,
  normalizeShopeeUrl,
  isShopeeProductUrl,
  isProductEligible,
  formatPrice,
} from './parser';

describe('Shopee Parser Unit Tests', () => {
  describe('parseSalesCount', () => {
    it('should parse simple single digits and double digits', () => {
      expect(parseSalesCount('5 vendidos')).toBe(5);
      expect(parseSalesCount('12 vendidos')).toBe(12);
      expect(parseSalesCount('49 vendidos')).toBe(49);
    });

    it('should parse thousands with comma and "mil"', () => {
      expect(parseSalesCount('1,2mil vendidos')).toBe(1200);
      expect(parseSalesCount('2,5mil vendidos')).toBe(2500);
      expect(parseSalesCount('10mil vendidos')).toBe(10000);
    });

    it('should parse thousands with "k"', () => {
      expect(parseSalesCount('1.5k vendidos')).toBe(1500);
      expect(parseSalesCount('3k')).toBe(3000);
    });

    it('should handle empty or null gracefully', () => {
      expect(parseSalesCount(null)).toBe(0);
      expect(parseSalesCount('')).toBe(0);
      expect(parseSalesCount(undefined)).toBe(0);
      expect(parseSalesCount('nenhum vendido')).toBe(0);
    });
  });

  describe('extractShopeeProductId', () => {
    it('should extract shopId and itemId from canonical Shopee URLs', () => {
      const url = 'https://shopee.com.br/Mini-Processador-Eletrico-i.123456789.987654321?sp_atk=abc';
      expect(extractShopeeProductId(url)).toBe('123456789.987654321');
    });

    it('should extract from direct product path', () => {
      const url = 'https://shopee.com.br/product/111222333/444555666';
      expect(extractShopeeProductId(url)).toBe('111222333.444555666');
    });

    it('should extract from shopid/itemid query params', () => {
      const url = 'https://shopee.com.br/item?sp_atk=xyz&shopid=111222333&itemid=444555666';
      expect(extractShopeeProductId(url)).toBe('111222333.444555666');
    });

    it('should extract from relative product path', () => {
      const url = '/product/111222333/444555666?sp_atk=abc';
      expect(extractShopeeProductId(url)).toBe('111222333.444555666');
    });
  });

  describe('isShopeeProductUrl', () => {
    it('should accept legacy -i. slug URLs', () => {
      expect(isShopeeProductUrl('https://shopee.com.br/Projetor-Portatil-i.123.456')).toBe(true);
    });

    it('should accept current /product/<shopId>/<itemId> URLs', () => {
      expect(isShopeeProductUrl('https://shopee.com.br/product/123/456')).toBe(true);
    });

    it('should accept shopid/itemid query param URLs', () => {
      expect(isShopeeProductUrl('https://shopee.com.br/item?shopid=123&itemid=456')).toBe(true);
      expect(isShopeeProductUrl('https://shopee.com.br/p?sp_atk=abc&shopid=123&itemid=456')).toBe(true);
    });

    it('should accept relative product URLs', () => {
      expect(isShopeeProductUrl('/product/123/456')).toBe(true);
      expect(isShopeeProductUrl('/Capa-de-Chuva-i.123.456')).toBe(true);
    });

    it('should reject non-product links', () => {
      expect(isShopeeProductUrl('https://shopee.com.br/m/campanha-promocional-frete-gratis')).toBe(false);
      expect(isShopeeProductUrl('https://shopee.com.br/')).toBe(false);
      expect(isShopeeProductUrl('https://shopee.com.br/product/abc/def')).toBe(false);
      expect(isShopeeProductUrl('https://shopee.com.br/item?shopid=abc&itemid=def')).toBe(false);
      expect(isShopeeProductUrl('')).toBe(false);
    });
  });

  describe('normalizeShopeeUrl', () => {
    it('should strip tracking parameters', () => {
      const url = 'https://shopee.com.br/Produto-Teste-i.123.456?sp_atk=xyz&xpt=123';
      expect(normalizeShopeeUrl(url)).toBe('https://shopee.com.br/Produto-Teste-i.123.456');
    });

    it('should keep current /product/ canonical URLs', () => {
      const url = 'https://shopee.com.br/product/123/456?sp_atk=xyz';
      expect(normalizeShopeeUrl(url)).toBe('https://shopee.com.br/product/123/456');
    });

    it('should convert shopid/itemid query URLs to /product/ canonical', () => {
      const url = 'https://shopee.com.br/item?sp_atk=xyz&shopid=123&itemid=456';
      expect(normalizeShopeeUrl(url)).toBe('https://shopee.com.br/product/123/456');
    });
  });

  describe('formatPrice', () => {
    it('should ensure R$ prefix is present', () => {
      expect(formatPrice('29,90')).toBe('R$ 29,90');
      expect(formatPrice('R$ 49,99')).toBe('R$ 49,99');
    });
  });

  describe('isProductEligible', () => {
    const existingIds = new Set(['111.222', '333.444']);

    it('should reject products with less than 5 sales', () => {
      expect(isProductEligible(0, '999.000', existingIds)).toBe(false);
      expect(isProductEligible(4, '999.000', existingIds)).toBe(false);
    });

    it('should reject products that already exist in database regardless of sales', () => {
      expect(isProductEligible(50, '111.222', existingIds)).toBe(false);
    });

    it('should accept products with >= 5 sales that are not in database', () => {
      expect(isProductEligible(5, '999.000', existingIds)).toBe(true);
      expect(isProductEligible(120, '888.777', existingIds)).toBe(true);
    });
  });
});
