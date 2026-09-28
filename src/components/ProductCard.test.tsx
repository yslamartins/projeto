import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductCard } from './ProductCard';
import { Product } from '@/types/product';

const baseProduct: Product = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Projetor Portátil',
  price: 'R$ 120,90',
  salesCount: 42,
  imageUrl: 'https://via.placeholder.com/150',
  productUrl: 'https://shopee.com.br/item/1',
  searchTerm: 'Projetor Portátil',
  status: 'pending',
  tikTokUrl: null,
  videoUrl: null,
  videoPath: null,
  videoStatus: 'none',
  whatsappStatus: 'none',
  sentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const noop = async () => {};

const render = (over: Partial<Product>, extra: Record<string, unknown> = {}) => {
  const props = {
    product: { ...baseProduct, ...over },
    onStatusChange: noop,
    onSearchVideo: noop,
    onDownloadVideo: noop,
    onPipelineVideo: noop,
    onSendToWhatsApp: noop,
    ...extra,
  };
  return renderToStaticMarkup(React.createElement(ProductCard, props));
};

describe('ProductCard: exibição condicional de vídeo', () => {
  it('videoStatus none → botão "Buscar e Baixar Vídeo" e badge "Sem vídeo"', () => {
    const html = render({});
    expect(html).toContain('Buscar e Baixar Vídeo');
    expect(html).toContain('Sem vídeo');
    expect(html).not.toContain('Baixar vídeo (HD)');
  });

  it('videoStatus searched + tikTokUrl → botão "Baixar vídeo (HD)" e badge "Pesquisado"', () => {
    const html = render({
      videoStatus: 'searched',
      tikTokUrl: 'https://www.tiktok.com/@u/video/123',
    });
    expect(html).toContain('Baixar vídeo (HD)');
    expect(html).toContain('Pesquisado');
    expect(html).not.toContain('Buscar e Baixar Vídeo');
  });

  it('videoStatus downloaded + videoPath → player <video> apontando para a rota privada e badge "Baixado"', () => {
    const html = render({
      videoStatus: 'downloaded',
      tikTokUrl: 'https://www.tiktok.com/@u/video/123',
      videoUrl: 'https://v16-webapp-prime.us.tiktok.com/video/tos/algo.mp4',
      videoPath: 'C:\\projeto\\.videos\\00000000-0000-0000-0000-000000000001.mp4',
    });
    expect(html).toContain('Baixado');
    expect(html).toContain('Baixar / ver vídeo');
    expect(html).toContain('<video');
    expect(html).toContain('/api/video/file?id=00000000-0000-0000-0000-000000000001');
  });

  it('videoStatus failed + tikTokUrl → botão de tentativa novamente e badge "Falhou"', () => {
    const html = render({
      videoStatus: 'failed',
      tikTokUrl: 'https://www.tiktok.com/@u/video/123',
    });
    expect(html).toContain('Tentar baixar novamente');
    expect(html).toContain('Falhou');
  });

  it('produto permanece pending após download (sem automação de published)', () => {
    const html = render({
      videoStatus: 'downloaded',
      videoPath: 'C:\\projeto\\.videos\\x.mp4',
    });
    expect(html).toContain('Pendente');
    expect(html).toContain('<option value="published">');
  });
});

describe('ProductCard: envio ao WhatsApp', () => {
  const downloaded = {
    videoStatus: 'downloaded' as const,
    tikTokUrl: 'https://www.tiktok.com/@u/video/123',
    videoPath: 'C:\\projeto\\.videos\\x.mp4',
  };

  it('vídeo baixado mostra o botão de enviar ao lado de "Baixar / ver vídeo"', () => {
    const html = render(downloaded);
    expect(html).toContain('Baixar / ver vídeo');
    expect(html).toContain('Enviar WhatsApp');
  });

  it('sem vídeo baixado não mostra o botão de enviar', () => {
    const html = render({ videoStatus: 'searched', tikTokUrl: 'https://www.tiktok.com/@u/video/123' });
    expect(html).not.toContain('Enviar WhatsApp');
  });

  it('produto já enviado mostra badge "Enviado" e botão travado', () => {
    const html = render({ ...downloaded, whatsappStatus: 'sent', sentAt: new Date() });
    expect(html).toContain('Enviado');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Não enviado');
  });

  it('produto com envio falhado mostra badge "Não enviado"', () => {
    const html = render(downloaded);
    expect(html).toContain('Não enviado');
    expect(html).toContain('Enviar WhatsApp');
  });
});

describe('ProductCard: ações travadas durante a fila', () => {
  it('actionsDisabled trava buscar/baixar e enviar ao mesmo tempo', () => {
    const searching = render({ videoStatus: 'none' }, { actionsDisabled: true });
    expect(searching).toContain('Buscando e baixando...');
    expect(searching).toContain('disabled');

    const downloaded = render(
      { videoStatus: 'downloaded', tikTokUrl: 'https://www.tiktok.com/@u/video/1', videoPath: 'C:\\v.mp4' },
      { actionsDisabled: true }
    );
    expect(downloaded).toContain('Enviar WhatsApp');
    expect(downloaded).toContain('disabled');
  });
});