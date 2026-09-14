import { PrismaClient } from '@prisma/client';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let client: PrismaClient;
let dir: string;

const toFileUrl = (p: string) => `file:${p.replace(/\\/g, '/')}`;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sof-crud-'));
  const dbPath = path.join(dir, 'crud-test.db');
  const schemaPath = path.join(dir, 'schema.prisma');

  const schema = fs
    .readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    .replace('url      = "file:./dev.db"', `url      = "${toFileUrl(dbPath)}"`);
  fs.writeFileSync(schemaPath, schema);

  execSync(`npx prisma db push --schema "${schemaPath}" --skip-generate`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  client = new PrismaClient({
    datasources: { db: { url: toFileUrl(dbPath) } },
  });
});

afterAll(async () => {
  await client.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

const base = {
  title: 'Boneca Erótica Silicone',
  price: 'R$ 89,90',
  salesCount: 12,
  imageUrl: 'https://example.local/img.png',
  productUrl: 'https://shopee.com.br/product/1/2',
  searchTerm: 'Boneca Erótica Silicone',
};

describe('Product CRUD com campos de vídeo', () => {
  it('usa videoStatus padrão "none" e tikTokUrl/videoUrl/videoPath nulos quando omitidos', async () => {
    const product = await client.product.create({
      data: { ...base, id: 'p-omitido' },
    });

    expect(product.videoStatus).toBe('none');
    expect(product.tikTokUrl).toBeNull();
    expect(product.videoUrl).toBeNull();
    expect(product.videoPath).toBeNull();
  });

  it('persiste tikTokUrl, videoUrl, videoPath e videoStatus informados na criação', async () => {
    const product = await client.product.create({
      data: {
        ...base,
        id: 'p-completo',
        tikTokUrl: 'https://www.tiktok.com/@user/video/123',
        videoUrl: null,
        videoPath: null,
        videoStatus: 'searched',
      },
    });

    expect(product.tikTokUrl).toBe('https://www.tiktok.com/@user/video/123');
    expect(product.videoStatus).toBe('searched');
  });

  it('transita videoStatus de searched para downloaded e salva as referências do arquivo', async () => {
    await client.product.update({
      where: { id: 'p-completo' },
      data: {
        videoStatus: 'downloaded',
        videoUrl: 'http://localhost:3000/api/products/p-completo/video',
        videoPath: '.videos/p-completo.mp4',
      },
    });

    const product = await client.product.findUnique({ where: { id: 'p-completo' } });

    expect(product?.videoStatus).toBe('downloaded');
    expect(product?.videoPath).toBe('.videos/p-completo.mp4');
    expect(product?.videoUrl).toContain('/api/products/p-completo/video');
  });

  it('não altera o status do produto (pendente) ao atualizar os campos de vídeo', async () => {
    const product = await client.product.update({
      where: { id: 'p-completo' },
      data: { videoStatus: 'downloaded' },
    });

    expect(product.status).toBe('pending');
  });
});