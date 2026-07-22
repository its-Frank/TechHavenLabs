/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output as static export so Electron can load index.html in production
  output: 'export',
  // Disable image optimization (not needed in Electron)
  images: { unoptimized: true },
  // Trailing slash so file:// paths resolve correctly in production
  trailingSlash: true,
  // Tell Next.js the app lives in src/
  // (Next 14 auto-detects src/app but this makes it explicit)
  reactStrictMode: true,
  // Needed for static export with App Router
  experimental: {},
};

module.exports = nextConfig;
