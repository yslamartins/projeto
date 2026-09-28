import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendVideoOfProductToWhatsApp } from '@/lib/whatsapp/send-product';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId ausente' },
        { status: 400 }
      );
    }

    const result = await sendVideoOfProductToWhatsApp(productId);

    if (result.failure === 'not_found') {
      return NextResponse.json({ success: false, error: result.error }, { status: 404 });
    }

    if (result.success) {
      const product = await prisma.product.update({
        where: { id: productId },
        data: { whatsappStatus: 'sent', sentAt: new Date() },
      });
      return NextResponse.json({ success: true, product });
    }

    await prisma.product
      .update({ where: { id: productId }, data: { whatsappStatus: 'failed' } })
      .catch(() => {});

    return NextResponse.json(
      { success: false, error: result.error || 'Falha ao enviar ao WhatsApp' },
      { status: result.failure === 'no_video' ? 400 : 502 }
    );
  } catch (error: any) {
    console.error('Error sending video to WhatsApp:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao enviar ao WhatsApp' },
      { status: 500 }
    );
  }
}
