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

const whatsappSendModule = vi.hoisted(() => ({
  sendProductVideoToWhatsApp: vi.fn(async () => {}),
}));

vi.mock('@/lib/scanner/tiktok-search', () => searchModule);
vi.mock('@/lib/tikdrop/download', () => downloadModule);
vi.mock('@/lib/whatsapp/send', () => whatsappSendModule);

import { runVideoDownload, runVideoPipeline } from './pipeline';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.product.update as ReturnType<typeof vi.fn>;

const baseProduct = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Projetor Portátil',
  productUrl: 'https://shopee.com.br/item/1',
  searchTerm: 'Projetor Portátil',
  tikTokUrl: null,
  videoPath: null,
  videoStatus: 'none',
};

const VIDEO_PATH = 'C:\\projeto\\.videos\\abc.mp4';

function mockSearchOk() {
  searchModule.searchTikTokVideo.mockResolvedValue({
    success: true,
    videoUrl: 'https://www.tiktok.com/@u/video/123',
  });
}

function mockDownloadOk() {
  downloadModule.downloadTikTokVideo.mockResolvedValue({
    success: true,
    videoUrl: 'https://tikdrop-k8re.onrender.com/resolved/video.mp4',
    videoPath: VIDEO_PATH,
  });
}

describe('runVideoPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(baseProduct);
    mockUpdate.mockImplementation(async ({ where, data }: any) => ({
      ...baseProduct,
      ...data,
      id: where.id,
    }));
  });

  it('devolve not_found sem tocar no banco quando o produto não existe', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await runVideoPipeline({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, failure: 'not_found' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('devolve missing_term quando o produto não tem título nem termo de busca', async () => {
    mockFindUnique.mockResolvedValue({ ...baseProduct, title: '', searchTerm: '' });

    const result = await runVideoPipeline({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, failure: 'missing_term' });
    expect(searchModule.searchTikTokVideo).not.toHaveBeenCalled();
  });

  it('busca no TikTok com o termo derivado do título', async () => {
    mockSearchOk();
    mockDownloadOk();

    await runVideoPipeline({ productId: baseProduct.id, headful: true });

    expect(searchModule.searchTikTokVideo).toHaveBeenCalledWith(
      expect.objectContaining({ headful: true })
    );
    expect(searchModule.searchTikTokVideo.mock.calls[0][0].term).toContain('Projetor');
  });

  it('falha na busca → videoStatus=failed e step=search', async () => {
    searchModule.searchTikTokVideo.mockResolvedValue({
      success: false,
      error: 'login necessário',
    });

    const result = await runVideoPipeline({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, step: 'search', error: 'login necessário' });
    expect(mockUpdate.mock.calls).toHaveLength(1);
    expect(mockUpdate.mock.calls[0][0].data.videoStatus).toBe('failed');
    expect(downloadModule.downloadTikTokVideo).not.toHaveBeenCalled();
  });

  it('falha no download → videoStatus=failed e step=download', async () => {
    mockSearchOk();
    downloadModule.downloadTikTokVideo.mockResolvedValue({
      success: false,
      error: 'tikdrop bloqueou',
    });

    const result = await runVideoPipeline({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, step: 'download', error: 'tikdrop bloqueou' });
    const statuses = mockUpdate.mock.calls.map((c: any) => c[0].data.videoStatus);
    expect(statuses).toEqual(['searched', 'failed']);
  });

  it('sucesso → searched e depois downloaded', async () => {
    mockSearchOk();
    mockDownloadOk();

    const result = await runVideoPipeline({ productId: baseProduct.id });

    expect(result.success).toBe(true);
    expect(result.product?.videoStatus).toBe('downloaded');
    const statuses = mockUpdate.mock.calls.map((c: any) => c[0].data.videoStatus);
    expect(statuses).toEqual(['searched', 'downloaded']);
  });

  it('não envia ao WhatsApp: o envio é uma ação separada', async () => {
    mockSearchOk();
    mockDownloadOk();

    await runVideoPipeline({ productId: baseProduct.id });

    expect(whatsappSendModule.sendProductVideoToWhatsApp).not.toHaveBeenCalled();
  });
});

describe('runVideoDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockImplementation(async ({ where, data }: any) => ({
      ...baseProduct,
      ...data,
      id: where.id,
    }));
    mockFindUnique.mockResolvedValue({ ...baseProduct, tikTokUrl: 'https://www.tiktok.com/@u/video/123' });
  });

  it('devolve not_found sem baixar quando o produto não existe', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await runVideoDownload({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, failure: 'not_found' });
    expect(downloadModule.downloadTikTokVideo).not.toHaveBeenCalled();
  });

  it('devolve missing_tikTok_url sem baixar quando a busca ainda não aconteceu', async () => {
    mockFindUnique.mockResolvedValue(baseProduct);

    const result = await runVideoDownload({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, failure: 'missing_tikTok_url' });
    expect(downloadModule.downloadTikTokVideo).not.toHaveBeenCalled();
  });

  it('baixa sem repetir a busca e grava o arquivo', async () => {
    mockDownloadOk();

    const result = await runVideoDownload({ productId: baseProduct.id, headful: false });

    expect(searchModule.searchTikTokVideo).not.toHaveBeenCalled();
    expect(downloadModule.downloadTikTokVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        tikTokUrl: 'https://www.tiktok.com/@u/video/123',
        productId: baseProduct.id,
        headful: false,
      })
    );
    expect(result.success).toBe(true);
    expect(result.product?.videoStatus).toBe('downloaded');
  });

  it('falha no download → videoStatus=failed', async () => {
    downloadModule.downloadTikTokVideo.mockResolvedValue({ success: false, error: 'sem rede' });

    const result = await runVideoDownload({ productId: baseProduct.id });

    expect(result).toMatchObject({ success: false, failure: 'download', error: 'sem rede' });
    expect(mockUpdate.mock.calls[0][0].data.videoStatus).toBe('failed');
  });

  it('não envia ao WhatsApp: o envio é uma ação separada', async () => {
    mockDownloadOk();

    await runVideoDownload({ productId: baseProduct.id });

    expect(whatsappSendModule.sendProductVideoToWhatsApp).not.toHaveBeenCalled();
  });
});
