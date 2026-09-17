import { NextResponse } from 'next/server';
import { resetShopeeProfile } from '@/lib/scanner/profile';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await resetShopeeProfile();
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    message: result.backupPath
      ? `Perfil da Shopee resetado. Backup em: ${result.backupPath}`
      : 'Nenhum perfil da Shopee encontrado para resetar.',
  });
}