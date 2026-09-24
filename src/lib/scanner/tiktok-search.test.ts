import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { runCollectMock } = vi.hoisted(() => ({ runCollectMock: vi.fn() }));
const { runCollectSessionMock } = vi.hoisted(() => ({ runCollectSessionMock: vi.fn() }));

vi.mock('./spawn-driver', () => ({
  runCollect: runCollectMock,
  runCollectSession: runCollectSessionMock,
}));

import { searchTikTokVideo, openTikTokSession } from './tiktok-search';
import { scannerEvents } from './events';
import type { ScanLogEvent } from '@/types/product';

const card = (author: string, videoId: string, caption: string) => ({
  href: `https://www.tiktok.com/@${author}/video/${videoId}`,
  caption,
  author,
});

function outcome(cards: any[], block: string | null = null) {
  return { ok: true, data: { term: 'mouse bluetooth', cards, count: cards.length, block }, exitCode: 0 };
}

describe('searchTikTokVideo (driver via spawn)', () => {
  let captured: ScanLogEvent[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    runCollectMock.mockReset();
    captured = [];
    scannerEvents.clear();
    scannerEvents.setVideoProcessing(false);
    unsubscribe = scannerEvents.subscribe((e) => captured.push(e));
  });

  afterEach(() => {
    unsubscribe();
    scannerEvents.setVideoProcessing(false);
  });

  it('busca ok: ranqueia e devolve o vídeo mais relevante (não o primeiro resultado)', async () => {
    runCollectMock.mockResolvedValue(
      outcome([
        card('outro', '111', 'apenas um vídeo qualquer'),
        card('parzival_shop', '222', 'melhor mouse bluetooth para trabalho e jogos'),
        card('outro2', '333', 'tutoriais de edição de foto'),
      ])
    );

    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });

    expect(result.success).toBe(true);
    expect(result.videoUrl).toBe('https://www.tiktok.com/@parzival_shop/video/222');
    expect(runCollectMock).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['tiktok', 'search', '--q', 'mouse bluetooth'] })
    );
    expect(captured.some((e) => e.type === 'success' && e.message.includes('Vídeo relevante encontrado'))).toBe(true);
  });

  it('login-wall detectado pelo driver: encerra com aviso sem quebrar', async () => {
    runCollectMock.mockResolvedValue({
      ok: false,
      error: 'O TikTok exibiu verificação de segurança ou exigiu login para ver os resultados.',
      exitCode: 1,
    });

    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('exigiu login');
    expect(captured.some((e) => e.type === 'error' && e.message.includes('exigiu login'))).toBe(true);
    expect(scannerEvents.getVideoProcessing()).toBe(false);
  });

  it('termo sem resultados: encerra com "nenhum vídeo relevante"', async () => {
    runCollectMock.mockResolvedValue(outcome([]));
    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Nenhum vídeo relevante encontrado no TikTok.');
  });

  it('cards sem relevância: mesmo comportamento de "nenhum relevante"', async () => {
    runCollectMock.mockResolvedValue(outcome([card('a', '111', 'loucura total'), card('b', '222', 'dancinha')]));
    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Nenhum vídeo relevante encontrado no TikTok.');
  });

  it('driver que falha: resulta em success=false com mensagem clara', async () => {
    runCollectMock.mockRejectedValue(new Error('driver quebrou'));
    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('driver quebrou');
    expect(scannerEvents.getVideoProcessing()).toBe(false);
  });

  it('busca concorrente é recusada enquanto outra automação roda', async () => {
    scannerEvents.setVideoProcessing(true);
    const result = await searchTikTokVideo({ term: 'mouse bluetooth' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Outra tarefa de automação');
  });
});

describe('openTikTokSession', () => {
  it('dispara a sessão headful do driver e responde sucesso imediato', async () => {
    runCollectSessionMock.mockReturnValue({ child: {} });
    const result = await openTikTokSession();
    expect(result.success).toBe(true);
    expect(runCollectSessionMock).toHaveBeenCalledWith({ args: ['tiktok', 'session'] });
  });
});