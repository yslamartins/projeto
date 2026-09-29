/**
 * Parser de texto e validação de produtos da Shopee
 */

/**
 * Vendas mínimas para um produto entrar na varredura. Fonte única da verdade:
 * a regra de elegibilidade e os textos que a descrevem na tela e nos logs.
 */
export const MIN_SALES = 1;

/**
 * Converte strings de vendas da Shopee para número inteiro.
 * Exemplos:
 * "5 vendidos" -> 5
 * "12 vendidos" -> 12
 * "1,2mil vendidos" -> 1200
 * "1.5k vendidos" -> 1500
 * "10mil vendidos" -> 10000
 * "nenhum vendido" -> 0
 */
export function parseSalesCount(salesText: string | null | undefined): number {
  if (!salesText) return 0;

  const text = salesText.toLowerCase().replace(/\s+/g, ' ').trim();

  // Match "1,2mil", "1.5k", "10mil"
  const milMatch = text.match(/([\d.,]+)\s*(?:mil|k)/i);
  if (milMatch) {
    const rawNumber = milMatch[1].replace(',', '.');
    const multiplier = 1000;
    const value = parseFloat(rawNumber);
    return isNaN(value) ? 0 : Math.round(value * multiplier);
  }

  // Match standard numbers like "5 vendidos", "28 vendidos", "120"
  const numberMatch = text.match(/([\d.]+)/);
  if (numberMatch) {
    const cleanNum = numberMatch[1].replace(/\./g, '');
    const value = parseInt(cleanNum, 10);
    return isNaN(value) ? 0 : value;
  }

  return 0;
}

/**
 * Verifica se a URL aponta para uma página de produto da Shopee, aceitando os
 * três formatos de link em circulação:
 * - Legado: ...-i.<shopId>.<itemId>
 * - Canônico atual: /product/<shopId>/<itemId>
 * - Query params: ?...shopid=<shopId>&itemid=<itemId>
 */
export function isShopeeProductUrl(url: string): boolean {
  if (!url) return false;

  const cleanUrl = url.split('?')[0];
  if (/-i\.\d+\.\d+/.test(cleanUrl)) return true;
  if (/\/product\/\d+\/\d+/.test(cleanUrl)) return true;

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://shopee.com.br${url}`);
    const shopid = parsed.searchParams.get('shopid');
    const itemid = parsed.searchParams.get('itemid');
    if (shopid && itemid && /^\d+$/.test(shopid) && /^\d+$/.test(itemid)) {
      return true;
    }
  } catch {
    // não é URL parseável, então não é produto
  }

  return false;
}

/**
 * Extrai o ID único do produto a partir da URL da Shopee.
 * Formatos aceitos: ...-i.<shopId>.<itemId>, /product/<shopId>/<itemId>
 * e ?...shopid=<shopId>&itemid=<itemId>.
 * Se nenhum for encontrado, gera um identificador canônico da URL limpa.
 */
export function extractShopeeProductId(url: string): string {
  try {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/-i\.(\d+)\.(\d+)/);
    if (match) {
      return `${match[1]}.${match[2]}`;
    }

    // Se for URL encurtada ou rota direta /product/<shopId>/<itemId>
    const directMatch = cleanUrl.match(/\/product\/(\d+)\/(\d+)/);
    if (directMatch) {
      return `${directMatch[1]}.${directMatch[2]}`;
    }

    // Links com shopid/itemid em query string
    const parsed = new URL(url.startsWith('http') ? url : `https://shopee.com.br${url}`);
    const shopid = parsed.searchParams.get('shopid');
    const itemid = parsed.searchParams.get('itemid');
    if (shopid && itemid && /^\d+$/.test(shopid) && /^\d+$/.test(itemid)) {
      return `${shopid}.${itemid}`;
    }

    // Fallback: hash ou pathname limpo
    return cleanUrl.replace(/^https?:\/\/[^/]+/, '');
  } catch {
    return url;
  }
}

/**
 * Normaliza a URL do produto removendo parâmetros de rastreamento e sessão.
 * Links com shopid/itemid em query string são convertidos para a forma
 * canônica /product/<shopId>/<itemId> para não perder os identificadores.
 */
export function normalizeShopeeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://shopee.com.br${url}`);

    const shopid = parsed.searchParams.get('shopid');
    const itemid = parsed.searchParams.get('itemid');
    if (shopid && itemid && /^\d+$/.test(shopid) && /^\d+$/.test(itemid)) {
      return `https://shopee.com.br/product/${shopid}/${itemid}`;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Normaliza o valor de preço para exibição amigável em R$
 */
export function formatPrice(priceText: string | null | undefined): string {
  if (!priceText) return 'R$ 0,00';
  const clean = priceText.trim();
  if (clean.startsWith('R$')) return clean;
  return `R$ ${clean}`;
}

/**
 * Regra de negócio de elegibilidade:
 * 1. Mínimo de MIN_SALES vendas
 * 2. Produto ainda não existente no banco
 */
export function isProductEligible(
  salesCount: number,
  productId: string,
  existingProductIds: Set<string>
): boolean {
  if (salesCount < MIN_SALES) return false;
  if (existingProductIds.has(productId)) return false;
  return true;
}
