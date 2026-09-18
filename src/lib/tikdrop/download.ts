import fs from 'fs';
import path from 'path';
import { scannerEvents } from '../scanner/events';
import {
  downloadTikTokVideoMp4,
  resolveTikTokVideo,
  TikDropErrorCode,
} from './client';

export interface DownloadResult {
  success: boolean;
  videoUrl?: string;
  videoPath?: string;
  error?: string;
}

const VIDEOS_DIR = path.resolve(process.cwd(), '.videos');

const TIKDROP_ERROR_MESSAGES: Record<TikDropErrorCode, string> = {
  invalid_url: 'Este não parece um link válido do TikTok.',
  unsupported_content: 'Só aceitamos vídeos — este post é um álbum de fotos ou texto.',
  video_unavailable: "Não conseguimos obter a versão sem marca d'água deste vídeo.",
  video_not_found: 'O vídeo não foi encontrado (pode ter sido removido ou tornado privado).',
  rate_limited: 'TikDrop limitou as solicitações. Aguarde um instante e tente de novo.',
  upstream_unavailable:
    'O serviço TikDrop/TikTok está temporariamente inacessível. Tente de novo em alguns instantes.',
  internal_error: 'Ocorreu um erro inesperado no TikDrop. Tente de novo.',
  network: 'Falha ao conectar ao serviço TikDrop. Verifique sua conexão e tente de novo.',
};

export function tikDropErrorToMessage(code: TikDropErrorCode): string {
  return TIKDROP_ERROR_MESSAGES[code] ?? TIKDROP_ERROR_MESSAGES.internal_error;
}

function isValidMp4File(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).includes(Buffer.from('ftyp'));
  } catch {
    return false;
  }
}

export async function downloadTikTokVideo(options: {
  tikTokUrl: string;
  productId: string;
  headful?: boolean;
}): Promise<DownloadResult> {
  const { tikTokUrl, productId } = options;

  if (scannerEvents.getIsScanning() || scannerEvents.getVideoProcessing()) {
    return { success: false, error: 'Outra automação em andamento.' };
  }

  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  const outPath = path.join(VIDEOS_DIR, `${productId}.mp4`);

  scannerEvents.setVideoProcessing(true);
  try {
    scannerEvents.emit('step', 'Resolvendo vídeo no TikDrop...');
    const resolveResult = await resolveTikTokVideo(tikTokUrl);

    if (!resolveResult.ok) {
      const message = tikDropErrorToMessage(resolveResult.error.code);
      scannerEvents.emit('error', `TikDrop não conseguiu resolver o vídeo: ${message}`);
      return { success: false, error: message };
    }

    const data = resolveResult.data;
    if (data.type !== 'video') {
      const message = tikDropErrorToMessage('unsupported_content');
      scannerEvents.emit('error', message);
      return { success: false, error: message };
    }

    scannerEvents.emit(
      'success',
      `Vídeo ${data.id} resolvido${data.title ? `: ${data.title}` : ''} (${data.media.quality}).`
    );

    scannerEvents.emit('step', 'Baixando o arquivo MP4 via TikDrop...');
    const downloadResult = await downloadTikTokVideoMp4({ tikTokUrl, outPath });

    if (!downloadResult.ok) {
      fs.rmSync(outPath, { force: true });
      const message = tikDropErrorToMessage(downloadResult.error.code);
      scannerEvents.emit('error', `Falha ao baixar via TikDrop: ${message}`);
      return { success: false, error: message };
    }

    if (downloadResult.sizeBytes < 1024 || !isValidMp4File(outPath)) {
      fs.rmSync(outPath, { force: true });
      const message = 'O arquivo baixado não é um MP4 válido. Tente novamente.';
      scannerEvents.emit('error', message);
      return { success: false, error: message };
    }

    scannerEvents.emit(
      'success',
      `Vídeo salvo: ${outPath} (${(downloadResult.sizeBytes / 1048576).toFixed(1)} MB)`
    );

    return {
      success: true,
      videoUrl: data.media.videoUrl,
      videoPath: outPath,
    };
  } catch (error: any) {
    console.error('Error downloading TikTok video:', error);
    scannerEvents.emit('error', `Erro ao baixar vídeo: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    scannerEvents.setVideoProcessing(false);
  }
}