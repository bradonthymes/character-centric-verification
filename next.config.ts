import type { NextConfig } from 'next';

// GitHub Pages serves a project site from /<repo>, so assets need that prefix.
// `assetPrefix` rather than `basePath`: it prefixes asset URLs while leaving the
// route at '/', which is what vinext's static export can prerender. The deploy
// workflow sets NEXT_PUBLIC_BASE_PATH; locally it is empty and the site runs at
// the root. Clear it if the study moves to a custom domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // Pages is static hosting: prerender to plain files instead of a server.
  output: 'export',
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
