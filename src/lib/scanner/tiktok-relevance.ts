export interface TikTokSearchCard {
  href: string;
  caption: string;
  author: string;
}

export interface RankedTikTokVideo {
  card: TikTokSearchCard;
  score: number;
}

export function normalizeTikTokText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const tokens = normalizeTikTokText(input).split(' ').filter(Boolean);
  return Array.from(new Set(tokens));
}

export function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/(?:video|photo)\/(\d+)/);
  return match ? match[1] : null;
}

export function toAbsoluteTikTokUrl(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith('/')) return `https://www.tiktok.com${href}`;
  return href;
}

export function scoreTikTokCard(card: TikTokSearchCard, term: string): number {
  const termTokens = tokenize(term);
  if (termTokens.length === 0) return 0;

  const captionTokens = tokenize(card.caption);
  const authorNormalized = normalizeTikTokText(card.author);

  let score = 0;

  for (const token of termTokens) {
    if (captionTokens.includes(token) || normalizeTikTokText(card.caption).includes(token)) {
      score += 1;
    }
  }

  if (termTokens.length > 1) {
    const matched = termTokens.filter((t) =>
      captionTokens.includes(t) || normalizeTikTokText(card.caption).includes(t)
    ).length;
    if (matched === termTokens.length) score += 2;
  } else {
    // Termo único: reforça quando aparece como substring exata na legenda
    if (captionTokens.includes(termTokens[0])) score += 2;
  }

  // Autor relevante contribui pouco
  if (termTokens.some((t) => authorNormalized.includes(t))) score += 1;

  // Penaliza legendas triviais/curtas demais (ex.: só emojis ou gírias)
  if (normalizeTikTokText(card.caption).length > 0 && tokenize(card.caption).length < 2) score -= 1;

  return score;
}

export function rankTikTokVideos(cards: TikTokSearchCard[], term: string): RankedTikTokVideo | null {
  let best: RankedTikTokVideo | null = null;

  for (const card of cards) {
    const score = scoreTikTokCard(card, term);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { card, score };
    }
  }

  return best;
}