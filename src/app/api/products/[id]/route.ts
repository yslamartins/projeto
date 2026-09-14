import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status, tikTokUrl, videoUrl, videoPath, videoStatus } = body;

    const data: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!['pending', 'published', 'discarded'].includes(status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status value' },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (videoStatus !== undefined) {
      if (!['none', 'searched', 'downloaded', 'failed'].includes(videoStatus)) {
        return NextResponse.json(
          { success: false, error: 'Invalid videoStatus value' },
          { status: 400 }
        );
      }
      data.videoStatus = videoStatus;
    }

    if (tikTokUrl !== undefined) data.tikTokUrl = tikTokUrl || null;
    if (videoUrl !== undefined) data.videoUrl = videoUrl || null;
    if (videoPath !== undefined) data.videoPath = videoPath || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No updates provided' },
        { status: 400 }
      );
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    console.error('Error updating product status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update product' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Product deleted' });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete product' },
      { status: 500 }
    );
  }
}
