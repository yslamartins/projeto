import { beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineModule = vi.hoisted(() => ({
  runVideoDownload: vi.fn(),
}));

vi.mock('@/lib/video/pipeline', () => pipelineModule);

import { POST } from './route';

async function callDownload(productId: string) {
  const req = new Request('http://localhost/api/video/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  return POST(req as any);
}

const PRODUCT_ID = '00000000-0000-0000-0000-000000000002';

describe('POST /api/video/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineModule.runVideoDownload.mockResolvedValue({
      success: true,
      product: { id: PRODUCT_ID, videoStatus: 'downloaded' },
    });
  });

  it('retorna 400 sem productId', async () => {
    const req = new Request('http://localhost/api/video/download', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect(pipelineModule.runVideoDownload).not.toHaveBeenCalled();
  });

  it('retorna 404 para produto inexistente', async () => {
    pipelineModule.runVideoDownload.mockResolvedValue({
      success: false,
      failure: 'not_found',
      error: 'Produto não encontrado',
    });

    const res = await callDownload(PRODUCT_ID);

    expect(res.status).toBe(404);
  });

  it('retorna 400 quando o produto não tem URL do TikTok', async () => {
    pipelineModule.runVideoDownload.mockResolvedValue({
      success: false,
      failure: 'missing_tikTok_url',
      error: 'Produto não possui URL do TikTok (busque antes)',
    });

    const res = await callDownload(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('URL do TikTok');
  });

  it('sucesso → devolve o produto baixado', async () => {
    const res = await callDownload(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.product.videoStatus).toBe('downloaded');
    expect(pipelineModule.runVideoDownload).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_ID })
    );
  });

  it('falha no download → erro sem alterar o status de sucesso', async () => {
    pipelineModule.runVideoDownload.mockResolvedValue({
      success: false,
      failure: 'download',
      step: 'download',
      error: 'tikdrop bloqueou',
    });

    const res = await callDownload(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error).toBe('tikdrop bloqueou');
  });
});
