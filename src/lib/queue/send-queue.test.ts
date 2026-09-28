import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
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

const sendProductModule = vi.hoisted(() => ({
  sendVideoOfProductToWhatsApp: vi.fn(),
}));

vi.mock('@/lib/whatsapp/send-product', () => sendProductModule);

import { findProductsPendingSend, startSendQueue } from './send-queue';
import { prisma } from '@/lib/prisma';

const mockFindMany = prisma.product.findMany as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.product.update as ReturnType<typeof vi.fn>;

const product = (id: string, title: string) => ({ id, title });

describe('findProductsPendingSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pega só quem tem vídeo baixado e ainda não foi enviado, pulando descartados', async () => {
    mockFindMany.mockResolvedValue([product('a', 'Projetor'), product('b', 'Mouse')]);

    const pending = await findProductsPendingSend();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          videoStatus: 'downloaded',
          whatsappStatus: { not: 'sent' },
          videoPath: { not: null },
          status: { not: 'discarded' },
        },
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(pending).toEqual([
      { id: 'a', title: 'Projetor' },
      { id: 'b', title: 'Mouse' },
    ]);
  });
});

describe('startSendQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockUpdate.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));
    sendProductModule.sendVideoOfProductToWhatsApp.mockResolvedValue({ success: true });
  });

  it('envia cada vídeo e registra o envio com a data', async () => {
    mockFindMany.mockResolvedValue([product('a', 'Projetor')]);

    const result = await startSendQueue();
    expect(result.ok).toBe(true);

    await vi.waitFor(() => expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalled());
    expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalledWith('a');
    expect(mockUpdate.mock.calls[0][0].data.whatsappStatus).toBe('sent');
    expect(mockUpdate.mock.calls[0][0].data.sentAt).toBeInstanceOf(Date);
  });

  it('um item que falha continua nos seguintes e marca o envio como falho', async () => {
    mockFindMany.mockResolvedValue([product('a', 'Projetor'), product('b', 'Mouse')]);
    sendProductModule.sendVideoOfProductToWhatsApp
      .mockResolvedValueOnce({ success: false, failure: 'send', error: 'grupo não encontrado' })
      .mockResolvedValueOnce({ success: true });

    await startSendQueue();
    await vi.waitFor(() =>
      expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalledTimes(2)
    );

    const statuses = mockUpdate.mock.calls.map((c: any) => c[0].data.whatsappStatus);
    expect(statuses).toEqual(['failed', 'sent']);
  });

  it('produto já enviado não entra na fila', async () => {
    // A query já exclui `whatsappStatus = sent`; aqui o contrato é que a lista
    // devolvida é a única enfileirada.
    mockFindMany.mockResolvedValue([product('a', 'Projetor')]);

    await startSendQueue();
    await vi.waitFor(() => expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalledTimes(1));
    expect(sendProductModule.sendVideoOfProductToWhatsApp).toHaveBeenCalledWith('a');
  });

  it('recusa iniciar quando não há vídeo para enviar', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await startSendQueue();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nenhum produto');
  });
});
