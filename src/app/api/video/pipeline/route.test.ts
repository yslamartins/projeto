import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/scanner/events', () => ({
  scannerEvents: {
    emit: vi.fn(),
    setVideoProcessing: vi.fn(),
    getVideoProcessing: vi.fn(),
    setIsScanning: vi.fn(),
    getIsScanning: vi.fn(),
  },
}));

const searchModule = vi.hoisted(() => ({
  searchTikTokVideo: vi.fn(),
}));

const downloadModule = vi.hoisted(() => ({
  downloadTikTokVideo: vi.fn(),
}));

vi.mock('@/lib/scanner/tiktok-search', () => searchModule);
vi.mock('@/lib/tikdrop/download', () => downloadModule);

import { POST } from './route';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.product.update as ReturnType<typeof vi.fn>;

async function callPipeline(productId: string) {
  const req = new Request('http://localhost/api/video/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  return POST(req as any);
}

const baseProduct = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Projetor Portátil',
  searchTerm: 'Projetor Portátil',
  tikTokUrl: null,
  videoStatus: 'none',
};

describe('POST /api/video/pipeline', () => {
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
    const req = new Request('http://localhost/api/video/pipeline', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('retorna 404 para produto inexistente', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await callPipeline(baseProduct.id);
    expect(res.status).toBe(404);
  });

  it('falha na busca → videoStatus=failed e step=search', async () => {
    searchModule.searchTikTokVideo.mockResolvedValue({
      success: false,
      error: 'login necessário',
    });
    downloadModule.downloadTikTokVideo.mockResolvedValue({ success: false });

    const res = await callPipeline(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.step).toBe('search');

    const updateCalls = mockUpdate.mock.calls;
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0].data.videoStatus).toBe('failed');
    expect(downloadModule.downloadTikTokVideo).not.toHaveBeenCalled();
  });

  it('falha no download → videoStatus=failed e step=download', async () => {
    searchModule.searchTikTokVideo.mockResolvedValue({
      success: true,
      videoUrl: 'https://www.tiktok.com/@u/video/123',
    });
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: false,
      error: 'tikdrop bloqueou',
    });

    const res = await callPipeline(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.step).toBe('download');
    expect(data.error).toBe('tikdrop bloqueou');

    const updateCalls = mockUpdate.mock.calls;
    const statuses = updateCalls.map((c: any) => c[0].data.videoStatus);
    expect(statuses).toEqual(['searched', 'failed']);
  });

  it('sucesso completo → searched e depois downloaded', async () => {
    searchModule.searchTikTokVideo.mockResolvedValue({
      success: true,
      videoUrl: 'https://www.tiktok.com/@u/video/123',
    });
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: true,
      videoUrl: 'https://tikdrop-k8re.onrender.com/resolved/video.mp4',
      videoPath: 'C:\\projeto\\.videos\\abc.mp4',
    });

    const res = await callPipeline(baseProduct.id);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.product.videoStatus).toBe('downloaded');

    const updateCalls = mockUpdate.mock.calls;
    const statuses = updateCalls.map((c: any) => c[0].data.videoStatus);
    expect(statuses).toEqual(['searched', 'downloaded']);
    expect(downloadModule.downloadTikTokVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        tikTokUrl: 'https://www.tiktok.com/@u/video/123',
        productId: baseProduct.id,
      })
    );
  });
});