import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const sendProductModule = vi.hoisted(() => ({
  sendVideoOfProductToWhatsApp: vi.fn(),
}));

vi.mock('@/lib/whatsapp/send-product', () => sendProductModule);

import { POST } from './route';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.product.update as ReturnType<typeof vi.fn>;

const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

async function callSend(productId?: string) {
  const req = new Request('http://localhost/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productId ? { productId } : {}),
  });
  return POST(req as any);
}

describe('POST /api/whatsapp/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));
    sendProductModule.sendVideoOfProductToWhatsApp.mockResolvedValue({ success: true });
  });

  it('retorna 400 sem productId', async () => {
    const res = await callSend();
    expect(res.status).toBe(400);
    expect(sendProductModule.sendVideoOfProductToWhatsApp).not.toHaveBeenCalled();
  });

  it('envia o vídeo e marca o produto como enviado com a data do envio', async () => {
    const res = await callSend(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalledWith(PRODUCT_ID);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].data.whatsappStatus).toBe('sent');
    expect(mockUpdate.mock.calls[0][0].data.sentAt).toBeInstanceOf(Date);
  });

  it('retorna 404 para produto inexistente sem marcar nada', async () => {
    sendProductModule.sendVideoOfProductToWhatsApp.mockResolvedValue({
      success: false,
      failure: 'not_found',
      error: 'Produto não encontrado',
    });

    const res = await callSend(PRODUCT_ID);

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('retorna 400 quando o produto não tem vídeo baixado', async () => {
    sendProductModule.sendVideoOfProductToWhatsApp.mockResolvedValue({
      success: false,
      failure: 'no_video',
      error: 'Produto não possui vídeo baixado',
    });

    const res = await callSend(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('vídeo');
  });

  it('marca o envio como falho e devolve 502 quando o WhatsApp recusa', async () => {
    sendProductModule.sendVideoOfProductToWhatsApp.mockResolvedValue({
      success: false,
      failure: 'send',
      error: 'grupo não encontrado',
    });

    const res = await callSend(PRODUCT_ID);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe('grupo não encontrado');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { whatsappStatus: 'failed' } })
    );
  });
});
