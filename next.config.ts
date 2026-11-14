import type { NextConfig } from 'next'

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS !== 'false'

const nextConfig: NextConfig = {
  // Pages folded into others; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: '/cashbook', destination: '/daybook', permanent: true },
      { source: '/expenses/lite', destination: '/daybook', permanent: true },
      { source: '/expenses/lite/new', destination: '/expenses/new', permanent: true },
      { source: '/daybook/credit/new', destination: '/daybook', permanent: true },
    ]
  },
  experimental: {
    authInterrupts: true,
    serverActions: {
      allowedOrigins: allowAllOrigins
        ? ['**.*', 'localhost:3000', ...extraOrigins]
        : ['localhost:3000', ...extraOrigins],
    },
  },
}

export default nextConfig
