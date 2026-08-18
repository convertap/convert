import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The web app is a BFF: it holds the session and calls the API server-side (ADR 0013).
  // No API base URL is exposed to the browser, so nothing here is NEXT_PUBLIC_.
  experimental: {
    // Domain packages are workspace source, not prebuilt.
    externalDir: true,
  },
  poweredByHeader: false,
};

export default config;
