import { describe, expect, it } from 'vitest';
import {
  isSsstikErrorText,
  pickSsstikDownloadAnchor,
  scoreSsstikAnchor,
  SsstikAnchor,
} from './parsing';

const anchor = (over: Partial<SsstikAnchor>): SsstikAnchor => ({
  href: 'https://ssstik.io/dl/abc123',
  text: 'Baixar sem marca d água',
  title: '',
  className: 'download_link',
  ...over,
});

describe('scoreSsstikAnchor', () => {
  it('prioriza o link HD (download_link + HD)', () => {
    const hd = scoreSsstikAnchor(anchor({ text: 'Baixar (HD)', className: 'download_link' }));
    const sd = scoreSsstikAnchor(anchor({ text: 'Baixar (SD)', className: 'download_link' }));
    expect(hd).toBeGreaterThan(sd);
  });

  it('descarta anúncios', () => {
    expect(
      scoreSsstikAnchor(anchor({ text: 'Anúncio', className: 'adlink', href: 'https://ad.net/x' }))
    ).toBe(0);
  });

  it('pontua link que termina em .mp4', () => {
    const mp4 = scoreSsstikAnchor(anchor({ href: 'https://cdn.example.com/video.mp4' }));
    const noMp4 = scoreSsstikAnchor(anchor({ href: 'https://cdn.example.com/d' }));
    expect(mp4).toBeGreaterThan(noMp4);
  });

  it('retorna 0 para URL relativa ou vazia', () => {
    expect(scoreSsstikAnchor(anchor({ href: '' }))).toBe(0);
    expect(scoreSsstikAnchor(anchor({ href: '/dl/abc' }))).toBe(0);
  });
});

describe('pickSsstikDownloadAnchor', () => {
  it('escolhe o link HD quando presente, não o primeiro', () => {
    const anchors: SsstikAnchor[] = [
      anchor({ href: 'https://ssstik.io/dl/sd1', text: 'Baixar (SD)', className: 'download_link' }),
      anchor({ href: 'https://ssstik.io/dl/hd1', text: 'Baixar Vídeo (HD)', className: 'download_link' }),
      anchor({ href: 'https://ssstik.io/dl/sd2', text: 'Baixar (SD)', className: 'download_link' }),
    ];
    expect(pickSsstikDownloadAnchor(anchors)).toBe('https://ssstik.io/dl/hd1');
  });

  it('retorna null quando só há anúncios', () => {
    const anchors: SsstikAnchor[] = [
      anchor({ href: 'https://ad.net/x', text: 'Anúncio', className: 'adlink' }),
    ];
    expect(pickSsstikDownloadAnchor(anchors)).toBeNull();
  });

  it('retorna null quando a lista está vazia', () => {
    expect(pickSsstikDownloadAnchor([])).toBeNull();
  });

  it('retorna o menor candidato viável se nada for HD', () => {
    const anchors: SsstikAnchor[] = [
      anchor({ href: 'https://ssstik.io/dl/x', text: 'Baixar', className: 'download_link' }),
    ];
    expect(pickSsstikDownloadAnchor(anchors)).toBe('https://ssstik.io/dl/x');
  });
});

describe('isSsstikErrorText', () => {
  it('detecta verificação/captcha', () => {
    expect(isSsstikErrorText('Marque a caixa para verificar que você não é um robô')).toBe(true);
    expect(isSsstikErrorText('reCAPTCHA obrigatório')).toBe(true);
  });

  it('aceita texto normal do resultado', () => {
    expect(isSsstikErrorText('Seu vídeo está pronto para download')).toBe(false);
  });
});