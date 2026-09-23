import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const VIDEOS_DIR = path.resolve(process.cwd(), '.videos');

function nodeReadableToWeb(nodeStream: fs.ReadStream): ReadableStream {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: string | Buffer) =>
        controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      );
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();

    if (!id || !/^(?:[0-9a-f-]{36}|\d+(?:\.\d+)*)$/i.test(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product || !product.videoPath) {
      return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
    }

    const filePath = product.videoPath;
    const expectedDir = VIDEOS_DIR.toLowerCase();

    // Previne path traversal
    if (!filePath.toLowerCase().startsWith(expectedDir)) {
      return NextResponse.json({ error: 'Caminho inválido' }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Arquivo não encontrado no disco' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Suporte a Range/206: sem isso os navegadores (especialmente com
    // <video preload="metadata">) não renderizam/seekam o MP4 corretamente.
    const rangeHeader = request.headers.get('range');
    let start = 0;
    let end = fileSize - 1;
    let status = 200;

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        const rangeStart = match[1] ? parseInt(match[1], 10) : null;
        const rangeEnd = match[2] ? parseInt(match[2], 10) : null;

        if (rangeStart === null && rangeEnd === null) {
          return NextResponse.json({ error: 'Range inválido' }, { status: 416 });
        }

        if (rangeStart === null) {
          // bytes=-N: últimos N bytes
          start = Math.max(fileSize - rangeEnd!, 0);
          end = fileSize - 1;
        } else {
          start = rangeStart;
          if (rangeEnd === null) {
            end = fileSize - 1;
          } else {
            end = Math.min(rangeEnd, fileSize - 1);
          }
        }

        if (start > end || start >= fileSize) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }

        status = 206;
      }
    }

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    };
    if (status === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    }

    return new NextResponse(nodeReadableToWeb(stream), { status, headers });
  } catch (error: any) {
    console.error('Error serving video:', error);
    return NextResponse.json({ error: 'Erro ao servir vídeo' }, { status: 500 });
  }
}