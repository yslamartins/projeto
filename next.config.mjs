/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.shopee.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.shopeesz.com',
      },
      {
        protocol: 'https',
        hostname: 'down-br.img.susercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'cf.shopee.com.br',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      }
    ],
  },
};

export default nextConfig;
