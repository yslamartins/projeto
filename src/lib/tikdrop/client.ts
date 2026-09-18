import fs from 'fs';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { pipeline } from 'stream/promises';

const DEFAULT_TIKDROP_API_URL = 'https://tikdrop-k8re.onrender.com';

export interface TikDropMedia {
  videoUrl: string;
  quality: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TikDropResolveData {
  id: string;
  type: string;
  title: string;
  author?: { username: string; nickname: string };
  thumbnail?: string;
  duration?: number;
  filename: string;
  media: TikDropMedia;
}

export type TikDropErrorCode =
  | 'invalid_url'
  | 'unsupported_content'
  | 'video_unavailable'
  | 'video_not_found'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'internal_error'
  | 'network';

export type TikDropResolveResult =
  | { ok: true; data: TikDropResolveData }
  | { ok: false; error: { code: TikDropErrorCode } };

export type TikDropDownloadResult =
  | { ok: true; sizeBytes: number }
  | { ok: false; error: { code: TikDropErrorCode } };

export function getTikDropApiUrl(): string {
  const fromEnv = process.env.TIKDROP_API_URL?.trim();
  return fromEnv ? fromEnv.replace(/\/+$/, '') : DEFAULT_TIKDROP_API_URL;
}

function parseErrorCode(body: string): TikDropErrorCode {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error?.code === 'string') {
      return parsed.error.code as TikDropErrorCode;
    }
  } catch {
    // corpo não-JSON: usa erro interno
  }
  return 'internal_error';
}

export async function resolveTikTokVideo(url: string): Promise<TikDropResolveResult> {
  const api = getTikDropApiUrl();
  let response: Response;
  try {
    response = await fetch(`${api}/v1/tiktok/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    return { ok: false, error: { code: 'network' } };
  }

  const body = await response.text().catch(() => '');
  if (!response.ok) {
    return { ok: false, error: { code: parseErrorCode(body) } };
  }

  let parsed: { ok?: boolean; data?: TikDropResolveData } | null = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  if (!parsed?.ok || !parsed?.data) {
    return { ok: false, error: { code: parseErrorCode(body) } };
  }

  const data = parsed.data;
  if (
    typeof data.id !== 'string' ||
    typeof data.type !== 'string' ||
    !data.media ||
    typeof data.media.videoUrl !== 'string'
  ) {
    return { ok: false, error: { code: 'internal_error' } };
  }

  return { ok: true, data };
}

export async function downloadTikTokVideoMp4(options: {
  tikTokUrl: string;
  outPath: string;
}): Promise<TikDropDownloadResult> {
  const api = getTikDropApiUrl();
  const url = `${api}/v1/tiktok/download?url=${encodeURIComponent(options.tikTokUrl)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, error: { code: 'network' } };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: { code: parseErrorCode(body) } };
  }

  if (!response.body) {
    return { ok: false, error: { code: 'internal_error' } };
  }

  await pipeline(
    Readable.fromWeb(response.body as WebReadableStream),
    fs.createWriteStream(options.outPath, { flags: 'w' })
  );

  const stats = fs.statSync(options.outPath);
  return { ok: true, sizeBytes: stats.size };
}