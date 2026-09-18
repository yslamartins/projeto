import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  downloadTikTokVideoMp4,
  getTikDropApiUrl,
  resolveTikTokVideo,
  TikDropResolveData,
} from './client';

const resolveData: TikDropResolveData = {
  id: '7674930051728805127',
  type: 'video',
  title: 'Produto em destaque',
  author: { username: 'loja', nickname: 'Loja' },
  filename: '@loja_7674930051728805127.mp4',
  media: {
    videoUrl: 'https://v16-webapp-prime.us.tiktok.com/video/tos/algo.mp4?a=1988',
    quality: '540p',
    mimeType: 'video/mp4',
    sizeBytes: 5090435,
  },
};

function mockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
}

describe('getTikDropApiUrl', () => {
  const originalEnv = process.env.TIKDROP_API_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TIKDROP_API_URL;
    } else {
      process.env.TIKDROP_API_URL = originalEnv;
    }
  });

  it('usa o default apontando para o serviço em onrender', () => {
    delete process.env.TIKDROP_API_URL;
    expect(getTikDropApiUrl()).toBe('https://tikdrop-k8re.onrender.com');
  });

  it('lê a base de TIKDROP_API_URL e remove barra final', () => {
    process.env.TIKDROP_API_URL = 'https://api.example.com/';
    expect(getTikDropApiUrl()).toBe('https://api.example.com');
  });
});

describe('resolveTikTokVideo', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('responde com sucesso e devolve o metadado tipado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: true, data: resolveData }))
    );

    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://tikdrop-k8re.onrender.com/v1/tiktok/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://www.tiktok.com/@loja/video/123' }),
      })
    );
    expect(result).toEqual({ ok: true, data: resolveData });
  });

  it('mapeia erro HTTP com código no corpo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ ok: false, error: { code: 'rate_limited' } }, { status: 429 })
        )
    );

    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'rate_limited' } });
  });

  it('mapeia resposta ok:false sem código como internal_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false }, { status: 500 })));
    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'internal_error' } });
  });

  it('propaga falha de rede como network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect refused')));
    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'network' } });
  });

  it('resposta inválida (não-JSON) vira internal_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('<html>boom</html>', { status: 200 })));
    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'internal_error' } });
  });

  it('resposta ok:false no corpo HTTP 200 propaga o código', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, error: { code: 'video_unavailable' } }))
    );
    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'video_unavailable' } });
  });

  it('resposta ok sem media.videoUrl vira internal_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          data: { id: '1', type: 'video', title: 'x', filename: 'x.mp4' },
        })
      )
    );
    const result = await resolveTikTokVideo('https://www.tiktok.com/@loja/video/123');
    expect(result).toEqual({ ok: false, error: { code: 'internal_error' } });
  });
});

describe('downloadTikTokVideoMp4', () => {
  const originalFetch = globalThis.fetch;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tikdrop-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('baixa o MP4 e reporta o tamanho gravado', async () => {
    const payload = '00000018ftypisom000000006D6F6F76fake-video-data';
    const bytes = Buffer.from(payload, 'utf8');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const outPath = path.join(tmpDir, 'video.mp4');
    const result = await downloadTikTokVideoMp4({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123',
      outPath,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://tikdrop-k8re.onrender.com/v1/tiktok/download?url=https%3A%2F%2Fwww.tiktok.com%2F%40loja%2Fvideo%2F123'
    );
    expect(result).toEqual({ ok: true, sizeBytes: bytes.length });
    expect(fs.readFileSync(outPath)).toEqual(bytes);
  });

  it('mapeia erro HTTP com código no corpo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ ok: false, error: { code: 'video_unavailable' } }, { status: 404 })
        )
    );

    const result = await downloadTikTokVideoMp4({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123',
      outPath: path.join(tmpDir, 'video.mp4'),
    });
    expect(result).toEqual({ ok: false, error: { code: 'video_unavailable' } });
  });

  it('propaga falha de rede como network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    const result = await downloadTikTokVideoMp4({
      tikTokUrl: 'https://www.tiktok.com/@loja/video/123',
      outPath: path.join(tmpDir, 'video.mp4'),
    });
    expect(result).toEqual({ ok: false, error: { code: 'network' } });
  });
});