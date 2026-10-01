import { NextResponse } from 'next/server';
import { getShopeeSessionStatus, openShopeeSession } from '@/lib/scanner/session';

export const dynamic = 'force-dynamic';

/** Abre a janela de login HITL. Resolve quando o Chrome confirma que subiu. */
export async function POST() {
  try {
    const result = await openShopeeSession();
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao abrir navegador' },
      { status: 500 }
    );
  }
}

/**
 * Estado de autenticação do `.shopee_profile`.
 *
 * `authenticated: null` significa "não deu para saber agora" — acontece quando o
 * Chrome está aberto, porque ele trava o arquivo de cookies em lock exclusivo.
 * A UI precisa tratar esse terceiro estado; senão volta a mentir "deslogado" no
 * momento em que a pessoa está justamente logando.
 */
export async function GET() {
  try {
    const status = await getShopeeSessionStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, authenticated: null, error: error.message },
      { status: 500 }
    );
  }
}