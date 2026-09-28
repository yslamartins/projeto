import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
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

const pipelineModule = vi.hoisted(() => ({
  runVideoPipeline: vi.fn(),
  runVideoDownload: vi.fn(),
}));

vi.mock('@/lib/video/pipeline', () => pipelineModule);

import { findProductsPendingDownload, startDownloadQueue } from './download-queue';
import { prisma } from '@/lib/prisma';

const mockFindMany = prisma.product.findMany as ReturnType<typeof vi.fn>;

const product = (id: string, title: string, tikTokUrl: string | null) => ({
  id,
  title,
  tikTokUrl,
});

describe('findProductsPendingDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pega só o que ainda não foi baixado, pulando descartados, do mais novo para o mais antigo', async () => {
    mockFindMany.mockResolvedValue([
      product('a', 'Projetor', null),
      product('b', 'Mouse', 'https://www.tiktok.com/@u/video/1'),
    ]);

    const pending = await findProductsPendingDownload();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { videoStatus: { not: 'downloaded' }, status: { not: 'discarded' } },
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(pending).toEqual([
      { id: 'a', title: 'Projetor', hasTikTokUrl: false },
      { id: 'b', title: 'Mouse', hasTikTokUrl: true },
    ]);
  });
});

describe('startDownloadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SCRAPLING_TEST_FAST', '1');
    mockFindMany.mockResolvedValue([]);
    pipelineModule.runVideoPipeline.mockResolvedValue({ success: true });
    pipelineModule.runVideoDownload.mockResolvedValue({ success: true });
  });

  it('produto sem URL do TikTok passa pelo pipeline de busca e download', async () => {
    mockFindMany.mockResolvedValue([product('a', 'Projetor', null)]);

    const result = await startDownloadQueue();
    expect(result.ok).toBe(true);

    await vi.waitFor(() => expect(pipelineModule.runVideoPipeline).toHaveBeenCalled());
    expect(pipelineModule.runVideoPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'a' })
    );
    expect(pipelineModule.runVideoDownload).not.toHaveBeenCalled();
  });

  it('produto que já tem URL do TikTok vai direto ao download, sem repetir a busca', async () => {
    mockFindMany.mockResolvedValue([product('b', 'Mouse', 'https://www.tiktok.com/@u/video/1')]);

    const result = await startDownloadQueue();
    expect(result.ok).toBe(true);

    await vi.waitFor(() => expect(pipelineModule.runVideoDownload).toHaveBeenCalled());
    expect(pipelineModule.runVideoDownload).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'b' })
    );
    expect(pipelineModule.runVideoPipeline).not.toHaveBeenCalled();
  });

  it('um item que falha não interrompe os seguintes', async () => {
    mockFindMany.mockResolvedValue([
      product('a', 'Projetor', null),
      product('b', 'Mouse', null),
    ]);
    pipelineModule.runVideoPipeline
      .mockResolvedValueOnce({ success: false, error: 'login necessário' })
      .mockResolvedValueOnce({ success: true });

    await startDownloadQueue();
    await vi.waitFor(() => expect(pipelineModule.runVideoPipeline).toHaveBeenCalledTimes(2));
  });

  it('recusa iniciar quando não há produto elegível', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await startDownloadQueue();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nenhum produto');
  });
});
