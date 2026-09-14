import { describe, expect, it } from 'vitest';
import {
  extractTikTokVideoId,
  normalizeTikTokText,
  rankTikTokVideos,
  scoreTikTokCard,
  toAbsoluteTikTokUrl,
  TikTokSearchCard,
} from './tiktok-relevance';

const card = (over: Partial<TikTokSearchCard>): TikTokSearchCard => ({
  href: 'https://www.tiktok.com/@loja/video/123456789',
  caption: 'Projetor mini portátil 4K review completo',
  author: 'lojadetecnologia',
  ...over,
});

describe('normalizeTikTokText', () => {
  it('remove acentos, caixa e pontuação', () => {
    expect(normalizeTikTokText('Projetor Portátil! Full-HD, 4K')).toBe(
      'projetor portatil full hd 4k'
    );
  });
});

describe('extractTikTokVideoId', () => {
  it('extrai o id de /video/<id>', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/@user/video/123456789')).toBe('123456789');
  });

  it('extrai o id de /photo/<id>', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/@user/photo/999')).toBe('999');
  });

  it('retorna null para URL sem id', () => {
    expect(extractTikTokVideoId('https://www.tiktok.com/explore')).toBeNull();
  });
});

describe('toAbsoluteTikTokUrl', () => {
  it('converte href relativo em URL completa', () => {
    expect(toAbsoluteTikTokUrl('/@user/video/1')).toBe('https://www.tiktok.com/@user/video/1');
  });

  it('mantém URL absoluta', () => {
    expect(toAbsoluteTikTokUrl('https://www.tiktok.com/@user/video/1')).toBe(
      'https://www.tiktok.com/@user/video/1'
    );
  });
});

describe('scoreTikTokCard', () => {
  it('termo exato na legenda pontua mais (substring única)', () => {
    const exact = scoreTikTokCard(
      card({ caption: 'Projetor Projetor Projetor review' }),
      'Projetor'
    );
    const partial = scoreTikTokCard(card({ caption: 'luz estrela quarto' }), 'Projetor');
    expect(exact).toBeGreaterThan(partial);
  });

  it('cobertura completa de termo multi-palavra vale mais que parcial', () => {
    const full = scoreTikTokCard(
      card({ caption: 'Projetor portátil WiFi 1080p' }),
      'Projetor portatil'
    );
    const partial = scoreTikTokCard(card({ caption: 'projetor de led' }), 'Projetor portatil');
    expect(full).toBeGreaterThan(partial);
  });

  it('legenda trivial curta é penalizada', () => {
    const trivial = scoreTikTokCard(card({ caption: 'kkkkk' }), 'Projetor');
    const real = scoreTikTokCard(card({ caption: 'Projetor WiFi review' }), 'Projetor');
    expect(trivial).toBeLessThan(real);
  });

  it('autor relevante contribui com pontuação pequena', () => {
    const withAuthor = scoreTikTokCard(card({ author: 'projetoresbr' }), 'Projetor');
    const without = scoreTikTokCard(card({ author: 'random' }), 'Projetor');
    expect(withAuthor).toBeGreaterThan(without);
  });
});

describe('rankTikTokVideos', () => {
  const cards: TikTokSearchCard[] = [
    card({ href: 'https://www.tiktok.com/@a/video/1', caption: 'musica aleatoria', author: 'x' }),
    card({
      href: 'https://www.tiktok.com/@b/video/2',
      caption: 'Projetor portátil A10 inteligente review',
      author: 'tecno',
    }),
    card({
      href: 'https://www.tiktok.com/@c/video/3',
      caption: 'projetor 1080p home theater',
      author: 'z',
    }),
    card({ href: 'https://www.tiktok.com/@d/video/4', caption: 'olhem isso kk', author: 'y' }),
  ];

  it('escolhe o vídeo mais relevante, não o primeiro resultado', () => {
    const best = rankTikTokVideos(cards, 'Projetor Portátil');
    expect(best).not.toBeNull();
    expect(best!.card.href).toContain('/video/2');
  });

  it('ignora cards sem correspondência (legenda aleatória)', () => {
    const onlyNoise = cards.filter((c) => c.href.includes('/video/1') || c.href.includes('/video/4'));
    expect(rankTikTokVideos(onlyNoise, 'Projetor Portátil')).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(rankTikTokVideos([], 'Projetor')).toBeNull();
  });

  it('normaliza o termo com acentos para casar com a legenda', () => {
    const best = rankTikTokVideos(
      [card({ caption: 'Kit calcinha algodão conforto', author: 'moda' })],
      'Kit Calcinha Algodao'
    );
    expect(best).not.toBeNull();
  });
});