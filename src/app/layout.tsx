import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shopee Video Opportunity Finder',
  description: 'Automação de mineração de produtos em alta na Shopee para afiliados',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
