import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial products for demonstration...');

  const sampleProducts = [
    {
      id: '298711425.234198214',
      title: 'Mini Processador Elétrico Portátil 250ml USB 3 Lâminas Alho Legumes',
      price: 'R$ 29,90',
      salesCount: 120,
      imageUrl: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=500&auto=format&fit=crop&q=60',
      productUrl: 'https://shopee.com.br/Mini-Processador-Eletrico-i.298711425.234198214',
      searchTerm: 'mini processador eletrico',
      status: 'pending',
    },
    {
      id: '412356789.987654321',
      title: 'Luminária de Mesa LED Articulada Touch com Porta Canetas e Suporte Celular',
      price: 'R$ 38,50',
      salesCount: 45,
      imageUrl: 'https://images.unsplash.com/photo-1534972195531-a756b1126975?w=500&auto=format&fit=crop&q=60',
      productUrl: 'https://shopee.com.br/Luminaria-de-Mesa-LED-i.412356789.987654321',
      searchTerm: 'luminaria led recarregavel',
      status: 'published',
    },
    {
      id: '556677889.112233445',
      title: 'Organizador Giratório 360 Graus Acrílico para Maquiagem Cosméticos e Skincare',
      price: 'R$ 49,99',
      salesCount: 8,
      imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=60',
      productUrl: 'https://shopee.com.br/Organizador-Girat%C3%B3rio-Acrilico-i.556677889.112233445',
      searchTerm: 'organizador multiuso',
      status: 'pending',
    },
  ];

  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
