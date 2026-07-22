/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone server mode for Electron with dynamic API routes
  // Static export (output: 'export') doesn't support API routes
  reactStrictMode: true,
  // Disable image optimization (not needed in Electron)
  images: { unoptimized: true },
};

module.exports = nextConfig;
