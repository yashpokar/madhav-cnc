import type { NextConfig } from 'next'

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS !== 'false'

const nextConfig: NextConfig = {
  // Stamped into the bundle at build time; shown by /api/v1/meta and in Settings.
  env: { PRODLYS_BUILT_AT: new Date().toISOString() },

  // Tags every build with its commit. A browser tab left open across a deploy
  // notices the mismatch and reloads itself, instead of failing with "Failed to
  // find Server Action". Unset locally, where there is nothing to protect.
  deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,

  // Pages folded into others; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: '/cashbook', destination: '/daybook', permanent: true },
      { source: '/expenses/lite', destination: '/daybook', permanent: true },
      { source: '/expenses/lite/new', destination: '/expenses/new', permanent: true },
      { source: '/daybook/credit/new', destination: '/daybook', permanent: true },
    ]
  },
  // The iOS app-link file has no extension, so say what it is.
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
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
