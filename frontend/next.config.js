/** @type {import('next').NextConfig} */
const repoBasePath = '/liheap-repeal-dashboard';
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  (process.env.NODE_ENV === 'production' ? repoBasePath : '');

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

module.exports = nextConfig;
