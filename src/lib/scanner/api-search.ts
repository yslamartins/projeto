import { Page } from 'playwright';
import { RawCardData } from './product-card-parser';

/**
 * Estrutura típica dos itens retornados pelo endpoint interno de busca da
 * Shopee (/api/v4/search/search_items). Cada item pode trazer os dados direto
 * ou aninhados em `item_basic`.
 */
export interface ApiSearchItemResult {
  gated: boolean;
  items: any[];
}

export function mapApiItemToRawCard(item: any): RawCardData | null {
  const basic = item?.item_basic || item;
  const itemid = basic?.itemid ?? item?.itemid;
  const shopid = basic?.shopid ?? item?.shopid;
  const name = basic?.name;
  const priceMax = basic?.price_max ?? basic?.price ?? 0;
  const sold = basic?.historical_sold ?? basic?.sold ?? 0;

  if (!itemid || !shopid || !name) return null;

  const rawHref = `https://shopee.com.br/product/${shopid}/${itemid}`;
  const priceInReals = Number(priceMax) / 100000;
  const rawPrice =
    Number.isFinite(priceInReals) && priceInReals > 0
      ? `R$ ${priceInReals.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : '';

  return {
    rawHref,
    rawTitle: String(name),
    rawPrice,
    rawSalesText: sold ? `${sold} vendidos` : '',
    rawImageUrl: basic?.image ? `https://down-br.img.susercontent.com/file/${basic.image}` : '',
  };
}

/**
 * Código de erro retornado pela Shopee quando a origem não é confiável
 * (anti-bot / verificação de tráfego).
 */
export const SHOPEE_ANTI_BOT_ERROR = 90309999;

/**
 * Chama o endpoint interno de busca da Shopee dentro da própria página (mesma
 * origin, aproveita cookies e tokens da sessão). Retorna `gated: true` quando
 * a Shopee responde com o erro anti-bot.
 */
export async function fetchSearchItems(page: Page, term: string, limit = 30): Promise<ApiSearchItemResult> {
  return page.evaluate(
    async ({ term, limit }) => {
      const qs = new URLSearchParams({
        by: 'relevancy',
        keyword: term,
        limit: String(limit),
        newest: '0',
        order: 'desc',
        page_type: 'search',
        scenario: 'PAGE_GLOBAL_SEARCH',
        version: '2',
      });

      const res = await fetch(`/api/v4/search/search_items?${qs.toString()}`, {
        headers: { 'x-api-source': 'pc' },
      });
      const json = await res.json().catch(() => null);

      if (json && String(json?.error) === '90309999') {
        return { gated: true, items: [] };
      }

      if (Array.isArray(json?.data)) {
        return { gated: false, items: json.data };
      }

      return { gated: false, items: Array.isArray(json?.data?.items) ? json.data.items : [] };
    },
    { term, limit }
  );
}