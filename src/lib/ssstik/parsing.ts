export interface SsstikAnchor {
  href: string;
  text?: string;
  title?: string;
  className?: string;
  id?: string;
}

export function scoreSsstikAnchor(anchor: SsstikAnchor): number {
  if (!anchor.href || !/^https?:\/\//.test(anchor.href)) return 0;

  const hay = `${anchor.className || ''} ${anchor.id || ''} ${anchor.title || ''} ${
    anchor.text || ''
  }`.toLowerCase();

  let score = 0;

  if (/download_link/.test(hay)) score += 5;
  else if (/download/.test(hay)) score += 2;

  if (/\bhd\b/.test(hay) || /sem marca d'?[aá]gua|no watermark|watermark/.test(hay)) score += 4;
  else if (/\bsd\b/.test(hay)) score += 1;

  if (/\.mp4$/i.test(anchor.href)) score += 3;

  // Anúncios/popups não são candidatos
  if (/advert|adlink|popup|sponsor/.test(hay)) return 0;

  return score;
}

export function pickSsstikDownloadAnchor(
  anchors: SsstikAnchor[],
  minScore: number = 5
): string | null {
  let bestHref: string | null = null;
  let bestScore = 0;

  for (const anchor of anchors) {
    const score = scoreSsstikAnchor(anchor);
    if (score < minScore) continue;
    if (score > bestScore) {
      bestScore = score;
      bestHref = anchor.href;
    }
  }

  return bestHref;
}

export function isSsstikErrorText(text: string): boolean {
  return /\brecaptcha\b|azcaptcha|captcha|verifica[cç][aã]o|marque a caixa|are you human|whoa, there/i.test(
    text.slice(0, 3000)
  );
}

/**
 * Rejeita URLs de anúncios/popups e aceita URLs reais de vídeo (MP4, endpoint
 * de vídeo do ssstik, ou hospedagem de vídeo do TikTok).
 */
export function isSsstikVideoUrl(url: string): boolean {
  if (!url || !/^https?:\/\//.test(url)) return false;
  if (/advert|adlink|popup|sponsor|doubleclick|amazonads|adservice/i.test(url)) return false;

  return (
    /\.mp4(\?|#|$)/i.test(url) ||
    /get_video|video_url|create_video|download_link|video_status/i.test(url) ||
    /cdn-?[a-z0-9-]*\.tiktok(\.com|\.cdn)?/i.test(url) ||
    /\/v[0-9]+\/([A-Za-z0-9_-]+)\//.test(url)
  );
}

export function findSsstikAnchors(
  elements: Array<{ href?: string | null; text?: string | null; title?: string | null; className?: string | null }>
): SsstikAnchor[] {
  return elements
    .map((el) => ({
      href: (el.href || '').trim(),
      text: (el.text || '').trim(),
      title: (el.title || '').trim(),
      className: (el.className || '').trim(),
    }))
    .filter((a) => a.href.length > 0);
}