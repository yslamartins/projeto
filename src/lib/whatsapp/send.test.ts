import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scannerEvents } from '@/lib/scanner/events';
import type { Product } from '@/types/product';
import { SHOPEE_VIDEO_GROUP_NAME } from './send';

const mocks = vi.hoisted(() => {
  const mockSendMessage = vi.fn<(...args: any[]) => Promise<any>>(async () => {});
  const mockGetChats = vi.fn<() => Promise<any[]>>(async () => []);
  let mockGroupChat: any = null;
  return {
    mockSendMessage,
    mockGetChats,
    setMockGroupChat: (chat: any) => {
      mockGroupChat = chat;
    },
    getMockGroupChat: () => mockGroupChat,
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
    getChats: mocks.mockGetChats,
    sendMessage: mocks.mockSendMessage,
  })),
}));

import { sendVideoAndLinkToGroup } from './send';
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
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.setMockGroupChat({
    isGroup: true,
    name: SHOPEE_VIDEO_GROUP_NAME,
    id: { _serialized: '120363012345678901@g.us' },
  });
  mocks.mockSendMessage.mockReset();
  mocks.mockGetChats.mockReset();
  mocks.mockGetChats.mockResolvedValue([mocks.getMockGroupChat()]);
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
    mocks.mockGetChats.mockResolvedValue([
      { isGroup: true, name: 'Outro Grupo', id: { _serialized: 'x' } },
    ]);
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(false);
    expect(result.error).toContain(SHOPEE_VIDEO_GROUP_NAME);
    expect(mocks.mockSendMessage).not.toHaveBeenCalled();
  });

  it('retorna erro quando o WhatsApp não está conectado', async () => {
    vi.mocked(getWhatsAppState).mockReturnValue('disconnected');
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(false);
    expect(result.error).toContain('WhatsApp não está conectado');
    expect(ensureWhatsAppSession).not.toHaveBeenCalled();
  });

  it('retorna erro quando sendMessage falha', async () => {
    mocks.mockSendMessage.mockRejectedValueOnce(new Error('network error'));
    const result = await sendVideoAndLinkToGroup(fakeProduct, '/tmp/video.mp4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('network error');
  });
});
