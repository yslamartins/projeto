import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where = status && status !== 'all' ? { status } : {};

    const products = await prisma.product.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, price, salesCount, imageUrl, productUrl, searchTerm, status } = body;

    if (!id || !title || !productUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required product fields' },
        { status: 400 }
      );
    }

    const product = await prisma.product.upsert({
      where: { id },
      update: {
        title,
        price: price || 'R$ 0,00',
        salesCount: Number(salesCount) || 0,
        imageUrl: imageUrl || '',
        productUrl,
        searchTerm: searchTerm || '',
        status: status || 'pending',
      },
      create: {
        id,
        title,
        price: price || 'R$ 0,00',
        salesCount: Number(salesCount) || 0,
        imageUrl: imageUrl || '',
        productUrl,
        searchTerm: searchTerm || '',
        status: status || 'pending',
      },
    });

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating/updating product:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save product' },
      { status: 500 }
    );
  }
}
