import {
  extractShopeeProductId,
  normalizeShopeeUrl,
  formatPrice,
  parseSalesCount,
  isProductEligible,
} from './parser';

export interface RawCardData {
  rawHref: string;
  rawTitle: string;
  rawPrice: string;
  rawSalesText: string;
  rawImageUrl?: string;
}

export interface ScrapedProductCandidate {
  id: string;
  title: string;
  price: string;
  salesCount: number;
  imageUrl: string;
  productUrl: string;
  isEligible: boolean;
}

export function parseProductCard(
  cardData: RawCardData,
  existingIds: Set<string>
): ScrapedProductCandidate | null {
  const { rawHref, rawTitle, rawPrice, rawSalesText, rawImageUrl } = cardData;

  if (!rawHref || !rawTitle || !rawHref.includes('-i.')) {
    return null;
  }

  const id = extractShopeeProductId(rawHref);
  if (!id) {
    return null;
  }

  const productUrl = normalizeShopeeUrl(rawHref);
  const price = formatPrice(rawPrice);
  const salesCount = parseSalesCount(rawSalesText);
  const imageUrl = rawImageUrl || '';
  const title = rawTitle.trim();

  const isEligible = isProductEligible(salesCount, id, existingIds);

  return {
    id,
    title,
    price,
    salesCount,
    imageUrl,
    productUrl,
    isEligible,
  };
}
