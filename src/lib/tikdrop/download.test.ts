import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/scanner/events', () => ({
  scannerEvents: {
    emit: vi.fn(),
    setVideoProcessing: vi.fn(),
    getVideoProcessing: vi.fn(() => false),
    setIsScanning: vi.fn(),
    getIsScanning: vi.fn(() => false),
  },
}));

const clientMock = vi.hoisted(() => ({
  resolveTikTokVideo: vi.fn(),
  downloadTikTokVideoMp4: vi.fn(),
}));

vi.mock('@/lib/tikdrop/client', () => clientMock);

import { downloadTikTokVideo, tikDropErrorToMessage } from './download';
import { scannerEvents } from '@/lib/scanner/events';

const resolvedVideo = {
  id: '123456789',
  type: 'video',
  title: 'Tênis em alta',
  author: { username: 'loja', nickname: 'Loja' },
  filename: '@loja_123456789.mp4',
  media: {
    videoUrl: 'https://cdn.example.com/video.mp4',
    quality: '540p',
    mimeType: 'video/mp4',
    sizeBytes: 5090435,
  },
};

const outPath = path.resolve(process.cwd(), '.videos', 'tikdrop-test.mp4');

function writeValidMp4(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const padding = Buffer.alloc(1200, 0);
  padding.write('ftypisom', 4);
  fs.writeFileSync(filePath, padding);
}

describe('tikDropErrorToMessage', () => {
  it('mapeia cada código de erro para uma mensagem amigável', () => {
    expect(tikDropErrorToMessage('invalid_url')).toContain('link válido');
    expect(tikDropErrorToMessage('unsupported_content')).toContain('álbum de fotos');
    expect(tikDropErrorToMessage('video_unavailable')).toContain('marca d\'água');
    expect(tikDropErrorToMessage('video_not_found')).toContain('não foi encontrado');
    expect(tikDropErrorToMessage('rate_limited')).toContain('TikDrop limitou');
    expect(tikDropErrorToMessage('upstream_unavailable')).toContain('inacessível');
    expect(tikDropErrorToMessage('internal_error')).toContain('inesperado');
    expect(tikDropErrorToMessage('network')).toContain('conectar');
  });
});

describe('downloadTikTokVideo (via TikDrop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.rmSync(outPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(outPath, { force: true });
  });

  it('resolve, baixa, valida MP4 e retorna videoUrl/videoPath', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({ ok: true, data: resolvedVideo });
    clientMock.downloadTikTokVideoMp4.mockImplementation(async ({ outPath: p }: any) => {
      writeValidMp4(p);
      return { ok: true, sizeBytes: fs.statSync(p).size };
    });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result).toEqual({
      success: true,
      videoUrl: resolvedVideo.media.videoUrl,
      videoPath: outPath,
    });
    expect(clientMock.resolveTikTokVideo).toHaveBeenCalledWith(
      'https://www.tiktok.com/@loja/video/123456789'
    );
    expect(scannerEvents.setVideoProcessing).toHaveBeenCalledWith(true);
    expect(scannerEvents.setVideoProcessing).toHaveBeenLastCalledWith(false);
  });

  it('falha com código do resolve mapeado para mensagem amigável', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({
      ok: false,
      error: { code: 'video_not_found' },
    });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('não foi encontrado');
    expect(clientMock.downloadTikTokVideoMp4).not.toHaveBeenCalled();
  });

  it('conteúdo não-vídeo vira erro de conteúdo não suportado', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({
      ok: true,
      data: { ...resolvedVideo, type: 'photo' },
    });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/photo/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('álbum de fotos');
  });

  it('arquivo baixado que não é MP4 é apagado e vira erro', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({ ok: true, data: resolvedVideo });
    clientMock.downloadTikTokVideoMp4.mockResolvedValue({ ok: true, sizeBytes: 5000 });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('não é um MP4 válido');
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it('falha no download via TikDrop propaga o código mapeado', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({ ok: true, data: resolvedVideo });
    clientMock.downloadTikTokVideoMp4.mockResolvedValue({
      ok: false,
      error: { code: 'rate_limited' },
    });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('TikDrop limitou');
  });

  it('falha inesperada mapeia para mensagem amigável e apaga arquivo parcial', async () => {
    clientMock.resolveTikTokVideo.mockResolvedValue({ ok: true, data: resolvedVideo });
    clientMock.downloadTikTokVideoMp4.mockImplementation(async ({ outPath: p }: any) => {
      writeValidMp4(p);
      throw new Error('socket hang up');
    });

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('conectar');
    expect(result.error).not.toContain('socket hang up');
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it('recusa quando outra automação está em andamento', async () => {
    (scannerEvents.getIsScanning as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await downloadTikTokVideo({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123456789',
      productId: 'tikdrop-test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Outra automação em andamento.');
    expect(clientMock.resolveTikTokVideo).not.toHaveBeenCalled();
  });
});