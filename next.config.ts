import type { NextConfig } from 'next'

const tunnelOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '*.ngrok-free.app',
        '*.ngrok.app',
        '*.ngrok.io',
        '*.trycloudflare.com',
        ...tunnelOrigins,
      ],
    },
  },
}

export default nextConfig
