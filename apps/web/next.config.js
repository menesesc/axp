const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  transpilePackages: ['shared', 'database'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
