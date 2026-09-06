import type { NextConfig } from 'next'

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS !== 'false'

const nextConfig: NextConfig = {
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
