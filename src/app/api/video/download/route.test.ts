import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const downloadModule = vi.hoisted(() => ({
  downloadTikTokVideo: vi.fn(),
}));

const whatsappSendModule = vi.hoisted(() => ({
  sendVideoAndLinkToGroup: vi.fn(),
}));

vi.mock('@/lib/tikdrop/download', () => downloadModule);
vi.mock('@/lib/whatsapp/send', () => whatsappSendModule);

import { POST } from './route';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.product.update as ReturnType<typeof vi.fn>;

async function callDownload(productId: string) {
  const req = new Request('http://localhost/api/video/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  return POST(req as any);
}

const baseProduct = {
  id: '00000000-0000-0000-0000-000000000002',
  title: 'Projetor Portátil',
  productUrl: 'https://shopee.com.br/produto/2',
  tikTokUrl: 'https://www.tiktok.com/@u/video/123',
  videoStatus: 'searched',
};

describe('POST /api/video/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(baseProduct);
    mockUpdate.mockImplementation(async ({ where, data }: any) => ({
      ...baseProduct,
      ...data,
      id: where.id,
    }));
  });

  it('retorna 400 sem productId', async () => {
    const req = new Request('http://localhost/api/video/download', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('retorna 404 para produto inexistente', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await callDownload(baseProduct.id);
    expect(res.status).toBe(404);
  });

  it('falha no download → videoStatus=failed e não chama o WhatsApp', async () => {
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: false,
      error: 'tikdrop bloqueou',
    });

    const res = await callDownload(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { videoStatus: 'failed' } })
    );
    expect(whatsappSendModule.sendVideoAndLinkToGroup).not.toHaveBeenCalled();
  });

  it('sucesso → videoStatus=downloaded e envia para o WhatsApp', async () => {
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: true,
      videoUrl: 'https://tikdrop-k8re.onrender.com/resolved/video.mp4',
      videoPath: 'C:\\projeto\\.videos\\abc.mp4',
    });
    whatsappSendModule.sendVideoAndLinkToGroup.mockResolvedValue({ success: true });

    const res = await callDownload(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.product.videoStatus).toBe('downloaded');
    expect(whatsappSendModule.sendVideoAndLinkToGroup).toHaveBeenCalledTimes(1);
    expect(whatsappSendModule.sendVideoAndLinkToGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        id: baseProduct.id,
        title: baseProduct.title,
        productUrl: baseProduct.productUrl,
        videoPath: 'C:\\projeto\\.videos\\abc.mp4',
      }),
      'C:\\projeto\\.videos\\abc.mp4'
    );
  });

  it('falha no envio ao WhatsApp não derruba o download (best-effort)', async () => {
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: true,
      videoUrl: 'https://tikdrop-k8re.onrender.com/resolved/video.mp4',
      videoPath: 'C:\\projeto\\.videos\\abc.mp4',
    });
    whatsappSendModule.sendVideoAndLinkToGroup.mockResolvedValue({
      success: false,
      error: 'grupo não encontrado',
    });

    const res = await callDownload(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.product.videoStatus).toBe('downloaded');
  });
});
