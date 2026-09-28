import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scannerEvents } from '@/lib/scanner/events';
import type { Product } from '@/types/product';
import { SHOPEE_VIDEO_GROUP_NAME } from './send';

const mocks = vi.hoisted(() => {
  const mockSendMessage = vi.fn<(...args: any[]) => Promise<any>>(async () => {});
  const mockFindGroupId = vi.fn<(...args: any[]) => Promise<string | null>>(
    async () => null
  );
  const mockFindGroupIdLive = vi.fn<(...args: any[]) => Promise<string | null>>(
    async () => null
  );
  const mockPages = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
  const mockReload = vi.fn<(...args: any[]) => Promise<any>>(async () => undefined);
  const mockReadyEvaluate = vi.fn<(...args: any[]) => Promise<any>>(async () => true);
  const mockCreateCDPSession = vi.fn<(...args: any[]) => Promise<any>>(
    async () => ({
      send: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
    })
  );
  const mockEvaluate = vi.fn<(...args: any[]) => Promise<any>>(
    async (_fn, ...args) => {
      if (args.length === 0) return mockReadyEvaluate();
      return mockFindGroupId();
    }
  );
  return {
    mockSendMessage,
    mockFindGroupId,
    mockFindGroupIdLive,
    mockPages,
    mockReload,
    mockReadyEvaluate,
    mockCreateCDPSession,
    mockEvaluate,
    setMockGroupIds: (ids: (string | null)[]) => {
      mockFindGroupId.mockImplementation(async () =>
        ids.length ? ids[0] : null
      );
      mockFindGroupIdLive.mockImplementation(async () =>
        ids.length ? ids[0] : null
      );
    },
  };
});

vi.mock('whatsapp-web.js', () => ({
  MessageMedia: {
    fromFilePath: vi.fn((filePath: string) => ({ filePath })),
  },
}));

vi.mock('./client', () => ({
  getWhatsAppState: vi.fn(),
  ensureWhatsAppSession: vi.fn(async () => ({
    pupPage: {
      evaluate: mocks.mockEvaluate,
      reload: mocks.mockReload,
      createCDPSession: mocks.mockCreateCDPSession,
    },
    pupBrowser: { pages: mocks.mockPages },
    sendMessage: mocks.mockSendMessage,
  })),
}));

import {
  connectWhatsAppOrLog,
  sendVideoAndLinkToGroup,
} from './send';
import { getWhatsAppState, ensureWhatsAppSession } from './client';

const fakeProduct: Product = {
  id: 'prod-123',
  title: 'Nail Trimmer Pet',
  price: 'R$ 39,90',
  salesCount: 120,
  imageUrl: 'https://img.shopee.com/1.jpg',
  productUrl: 'https://shopee.com.br/product/123',
  searchTerm: 'poderoso cortador de unha',
  status: 'pending',
  tikTokUrl: null,
  videoUrl: null,
  videoPath: null,
  videoStatus: 'none',
  whatsappStatus: 'none',
  sentAt: null,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.setMockGroupIds(['120363012345678901@g.us']);
  vi.mocked(getWhatsAppState).mockReturnValue('connected');
});

describe('sendVideoAndLinkToGroup', () => {
  it('envia o vídeo com legenda = título + link do produto', async () => {
    const emitSpy = vi.spyOn(scannerEvents, 'emit');
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(true);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(1);

    const [chatId, media, options] = mocks.mockSendMessage.mock
      .calls[0] as unknown as [string, any, any];
    expect(chatId).toBe('120363012345678901@g.us');
    expect(media).toEqual({ filePath: '/tmp/video.mp4' });
    expect(options).toEqual({
      caption: 'Nail Trimmer Pet\nhttps://shopee.com.br/product/123',
    });
    expect(
      emitSpy.mock.calls.some(
        (c) => c[0] === 'success' && String(c[1]).includes('vídeo e link enviados')
      )
    ).toBe(true);
  });

  it('retorna erro quando o grupo não é encontrado', async () => {
    mocks.setMockGroupIds([]);
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(false);
    expect(result.error).toContain(SHOPEE_VIDEO_GROUP_NAME);
    expect(mocks.mockSendMessage).not.toHaveBeenCalled();
  });

  it('retoma a sessão salva e envia quando estava desconectado', async () => {
    vi.mocked(getWhatsAppState)
      .mockReturnValueOnce('disconnected')
      .mockReturnValue('connected');
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 500);

    expect(result.success).toBe(true);
    expect(ensureWhatsAppSession).toHaveBeenCalledTimes(2);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('retorna erro sem enviar quando não conecta dentro do tempo de espera', async () => {
    vi.mocked(getWhatsAppState).mockReturnValue('disconnected');
    const result = await sendVideoAndLinkToGroup(
      fakeProduct,
      '/tmp/video.mp4',
      60
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WhatsApp não está conectado');
    expect(ensureWhatsAppSession).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendMessage).not.toHaveBeenCalled();
  });

  it('retorna erro quando sendMessage falha', async () => {
    mocks.mockSendMessage.mockRejectedValueOnce(new Error('network error'));
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('network error');
  });

  it('re-envia quando o WA Web recarregou e o frame ficou órfão (detached frame)', async () => {
    mocks.mockSendMessage
      .mockRejectedValueOnce(
        new Error("Attempted to use detached Frame '9B4DECE9B9444DD6C287FD930172A54E'")
      )
      .mockResolvedValueOnce(undefined);

    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 200, 5);

    expect(result.success).toBe(true);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(2);
    const [chatId, , options] = mocks.mockSendMessage.mock
      .calls[1] as unknown as [string, any, any];
    expect(chatId).toBe('120363012345678901@g.us');
    expect(options.caption).toContain(fakeProduct.title);
  });

  it('tenta de novo quando o frame órfão aparece na busca do grupo', async () => {
    mocks.mockFindGroupId
      .mockRejectedValueOnce(
        new Error("Attempted to use detached Frame 'DBFE'")
      )
      .mockResolvedValueOnce('120363012345678901@g.us');

    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 200, 5);

    expect(result.success).toBe(true);
    expect(mocks.mockFindGroupId).toHaveBeenCalledTimes(2);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('reaponta para uma página viva do WA Web antes de reenviar', async () => {
    mocks.mockPages.mockResolvedValue([
      {
        evaluate: mocks.mockFindGroupIdLive,
        isClosed: () => false,
        url: () => 'https://web.whatsapp.com/?some=query',
      },
    ]);
    mocks.mockSendMessage
      .mockRejectedValueOnce(
        new Error("Attempted to use detached Frame '9B4D'")
      )
      .mockResolvedValueOnce(undefined);

    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 200, 5);

    expect(result.success).toBe(true);
    expect(mocks.mockPages).toHaveBeenCalledTimes(1);
    expect(mocks.mockFindGroupId).toHaveBeenCalledTimes(1);
    expect(mocks.mockFindGroupIdLive).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it('recarrega a página e espera a sessão reconectar antes de reenviar', async () => {
    mocks.mockSendMessage
      .mockRejectedValueOnce(
        new Error("Attempted to use detached Frame '9B4D'")
      )
      .mockResolvedValueOnce(undefined);

    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 200, 5);

    expect(result.success).toBe(true);
    expect(mocks.mockReload).toHaveBeenCalledTimes(1);
    expect(mocks.mockReadyEvaluate).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(2);
    const [chatId, , options] = mocks.mockSendMessage.mock
      .calls[1] as unknown as [string, any, any];
    expect(chatId).toBe('120363012345678901@g.us');
    expect(options.caption).toContain(fakeProduct.title);
  });

  it('reporta o erro se o segundo envio também falhar por frame órfão', async () => {
    mocks.mockSendMessage.mockRejectedValue(
      new Error("Attempted to use detached Frame 'ABC'")
    );

    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4', 200, 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain('detached Frame');
    expect(mocks.mockSendMessage).toHaveBeenCalledTimes(2);
  });
});

describe('connectWhatsAppOrLog', () => {
  it('retorna o client imediatamente quando está conectado', async () => {
    const client = await connectWhatsAppOrLog(200);
    expect(ensureWhatsAppSession).toHaveBeenCalledTimes(1);
    expect(client).toBeTruthy();
  });

  it('espera a sessão salva conectar e então retorna o client', async () => {
    vi.mocked(getWhatsAppState)
      .mockReturnValueOnce('disconnected')
      .mockReturnValueOnce('connecting')
      .mockReturnValue('connected');
    const client = await connectWhatsAppOrLog(1000);
    expect(client).toBeTruthy();
    expect(ensureWhatsAppSession).toHaveBeenCalledTimes(2);
  });

  it('retorna null quando a sessão não conecta até o fim da espera', async () => {
    vi.mocked(getWhatsAppState).mockReturnValue('disconnected');
    const client = await connectWhatsAppOrLog(80);
    expect(client).toBeNull();
  });
});

