import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requestWhatsAppQr } from '@/lib/whatsapp/client';
import { GET } from './route';

vi.mock('@/lib/whatsapp/client', () => ({
  requestWhatsAppQr: vi.fn(),
}));

function qrRequest(format?: string) {
  const url = format
    ? `http://localhost/api/whatsapp/qr?format=${format}`
    : 'http://localhost/api/whatsapp/qr';
  return new NextRequest(url);
}

describe('GET /api/whatsapp/qr', () => {
  it('devolve o QR como imagem PNG para escanear no navegador', async () => {
    vi.mocked(requestWhatsAppQr).mockResolvedValue({
      state: 'waiting_qr',
      qr: 'data:image/png;base64,U29tZUtRcg==',
    });
    const response = await GET(qrRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.toString('utf8')).toBe('SomeKQr');
  });

  it('devolve JSON com o QR como data URL com ?format=json', async () => {
    vi.mocked(requestWhatsAppQr).mockResolvedValue({
      state: 'waiting_qr',
      qr: 'data:image/png;base64,U29tZUtRcg==',
    });
    const response = await GET(qrRequest('json'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'waiting_qr',
      qr: 'data:image/png;base64,U29tZUtRcg==',
    });
  });

  it('retorna qr null quando não há QR ainda', async () => {
    vi.mocked(requestWhatsAppQr).mockResolvedValue({
      state: 'disconnected',
      qr: null,
    });
    const response = await GET(qrRequest());

    expect(await response.json()).toEqual({
      state: 'disconnected',
      qr: null,
    });
  });

  it('retorna 500 com estado disconnected quando falha', async () => {
    vi.mocked(requestWhatsAppQr).mockRejectedValue(new Error('browser boom'));
    const response = await GET(qrRequest());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.state).toBe('disconnected');
    expect(body.qr).toBeNull();
    expect(body.error).toBe('browser boom');
  });
});