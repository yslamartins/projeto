import { describe, expect, it, vi } from 'vitest';
import { requestWhatsAppQr } from '@/lib/whatsapp/client';
import { GET } from './route';

vi.mock('@/lib/whatsapp/client', () => ({
  requestWhatsAppQr: vi.fn(),
}));

describe('GET /api/whatsapp/qr', () => {
  it('retorna o QR como data URL quando disponível', async () => {
    vi.mocked(requestWhatsAppQr).mockResolvedValue({
      state: 'waiting_qr',
      qr: 'data:image/png;base64,QRCODE',
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'waiting_qr',
      qr: 'data:image/png;base64,QRCODE',
    });
  });

  it('retorna qr null quando não há QR ainda', async () => {
    vi.mocked(requestWhatsAppQr).mockResolvedValue({
      state: 'disconnected',
      qr: null,
    });
    const response = await GET();
    expect(await response.json()).toEqual({
      state: 'disconnected',
      qr: null,
    });
  });

  it('retorna 500 com estado disconnected quando falha', async () => {
    vi.mocked(requestWhatsAppQr).mockRejectedValue(new Error('browser boom'));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.state).toBe('disconnected');
    expect(body.qr).toBeNull();
    expect(body.error).toBe('browser boom');
  });
});