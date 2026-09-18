import { describe, expect, it, vi } from 'vitest';
import { getWhatsAppState } from '@/lib/whatsapp/client';
import { GET } from './route';

vi.mock('@/lib/whatsapp/client', () => ({
  getWhatsAppState: vi.fn(() => 'disconnected'),
}));

describe('GET /api/whatsapp/status', () => {
  it('retorna o estado da sessão do WhatsApp', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'disconnected' });
  });

  it('reflete o estado conectado', async () => {
    vi.mocked(getWhatsAppState).mockReturnValue('connected');
    const response = await GET();
    expect(await response.json()).toEqual({ state: 'connected' });
  });
});