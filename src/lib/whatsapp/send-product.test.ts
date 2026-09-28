import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
    },
  },
}));

const sendModule = vi.hoisted(() => ({
  sendVideoAndLinkToGroup: vi.fn(),
}));

vi.mock('./send', () => sendModule);

import { sendVideoOfProductToWhatsApp } from './send-product';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;

const product = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Projetor Portátil',
  productUrl: 'https://shopee.com.br/item/1',
  videoPath: 'C:\\projeto\\.videos\\abc.mp4',
};

describe('sendVideoOfProductToWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(product);
    sendModule.sendVideoAndLinkToGroup.mockResolvedValue({ success: true });
  });

  it('carrega o produto e envia o vídeo com a legenda de nome e link', async () => {
    const result = await sendVideoOfProductToWhatsApp(product.id);

    expect(result).toEqual({ success: true });
    expect(sendModule.sendVideoAndLinkToGroup).toHaveBeenCalledWith(product, product.videoPath);
  });

  it('devolve erro sem enviar quando o produto não existe', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await sendVideoOfProductToWhatsApp('inexistente');

    expect(result).toMatchObject({ success: false, failure: 'not_found' });
    expect(sendModule.sendVideoAndLinkToGroup).not.toHaveBeenCalled();
  });

  it('devolve erro sem enviar quando o produto não tem vídeo baixado', async () => {
    mockFindUnique.mockResolvedValue({ ...product, videoPath: null });

    const result = await sendVideoOfProductToWhatsApp(product.id);

    expect(result).toMatchObject({ success: false, failure: 'no_video' });
    expect(sendModule.sendVideoAndLinkToGroup).not.toHaveBeenCalled();
  });

  it('propaga a falha de envio do WhatsApp marcada como falha de envio', async () => {
    sendModule.sendVideoAndLinkToGroup.mockResolvedValue({
      success: false,
      error: 'grupo não encontrado',
    });

    const result = await sendVideoOfProductToWhatsApp(product.id);

    expect(result).toMatchObject({
      success: false,
      failure: 'send',
      error: 'grupo não encontrado',
    });
  });

  it('marca como sucesso sem failure quando o envio passa', async () => {
    const result = await sendVideoOfProductToWhatsApp(product.id);

    expect(result).toEqual({ success: true });
  });
});
