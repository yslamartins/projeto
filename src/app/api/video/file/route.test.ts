import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from './route';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.product.findUnique as ReturnType<typeof vi.fn>;

async function callGet(id: string) {
  const req = new Request(`http://localhost/api/video/file?id=${encodeURIComponent(id)}`);
  return GET(req as any);
}

describe('GET /api/video/file', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('rejeita id com path traversal (não é UUID) com 400', async () => {
    const res = await callGet('../../../../etc/passwd');
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('aceita id numérico Shopee (itemid) e consulta o produto', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await callGet('627750190.22899492773');
    expect(res.status).toBe(404);
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: '627750190.22899492773' } });
  });

  it('retorna 404 para produto inexistente', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await callGet('00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(404);
  });

  it('retorna 404 para produto sem videoPath', async () => {
    mockFindUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001', videoPath: null });
    const res = await callGet('00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(404);
  });

  it('retorna 403 se o videoPath escapa da pasta privada', async () => {
    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: 'C:/outside/injected.mp4',
    });
    const res = await callGet('00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(403);
  });

  it('retorna 404 se o arquivo não existe em disco', async () => {
    const missing = path.join(process.cwd(), '.videos', 'missing.mp4');
    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: missing,
    });
    const res = await callGet('00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(404);
  });

  it('serve o MP4 da pasta privada com contentType e Content-Length', async () => {
    const dir = path.join(process.cwd(), '.videos');
    fs.mkdirSync(dir, { recursive: true });
    const sample = path.join(dir, 'sample-test.mp4');
    fs.writeFileSync(sample, Buffer.from('fake-mp4-bytes'));

    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: sample,
    });

    const res = await callGet('00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-length')).toBe(String('fake-mp4-bytes'.length));

    await res.arrayBuffer();
    fs.rmSync(sample, { force: true });
  });

  it('honra Range bytes=start-end com 206 e dirige o slice', async () => {
    const dir = path.join(process.cwd(), '.videos');
    fs.mkdirSync(dir, { recursive: true });
    const sample = path.join(dir, 'range-test.mp4');
    const content = Buffer.from('0123456789abcdef');
    fs.writeFileSync(sample, content);

    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: sample,
    });

    const req = new Request('http://localhost/api/video/file?id=00000000-0000-0000-0000-000000000001', {
      headers: { Range: 'bytes=2-5' },
    });
    const res = await GET(req as any);

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/16');
    expect(res.headers.get('content-length')).toBe('4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toBe('2345');

    fs.rmSync(sample, { force: true });
  });

  it('honra Range aberto bytes=end- até o final do arquivo', async () => {
    const dir = path.join(process.cwd(), '.videos');
    fs.mkdirSync(dir, { recursive: true });
    const sample = path.join(dir, 'range-open-test.mp4');
    const content = Buffer.from('0123456789abcdef');
    fs.writeFileSync(sample, content);

    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: sample,
    });

    const req = new Request('http://localhost/api/video/file?id=00000000-0000-0000-0000-000000000001', {
      headers: { Range: 'bytes=8-' },
    });
    const res = await GET(req as any);

    expect(res.status).toBe(206);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toBe('89abcdef');

    fs.rmSync(sample, { force: true });
  });

  it('retorna 416 para range inválido (início além do fim)', async () => {
    const dir = path.join(process.cwd(), '.videos');
    fs.mkdirSync(dir, { recursive: true });
    const sample = path.join(dir, 'range-invalid-test.mp4');
    fs.writeFileSync(sample, Buffer.from('abc'));

    mockFindUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      videoPath: sample,
    });

    const req = new Request('http://localhost/api/video/file?id=00000000-0000-0000-0000-000000000001', {
      headers: { Range: 'bytes=99-100' },
    });
    const res = await GET(req as any);

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */3');

    fs.rmSync(sample, { force: true });
  });
});