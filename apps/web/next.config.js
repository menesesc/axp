/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  transpilePackages: ['shared', 'database'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
