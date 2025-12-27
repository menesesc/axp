/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ['shared', 'database'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
