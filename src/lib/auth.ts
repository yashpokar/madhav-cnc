import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { prisma } from '@/lib/prisma'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleEnabled = Boolean(googleClientId && googleClientSecret)

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.PUBLIC_BASE_URL,
  ...(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) =>
      origin.startsWith('http') ? origin : `https://${origin}`,
    ),
].filter((origin): origin is string => Boolean(origin))

export const auth = betterAuth({
  appName: 'Madhav CNC',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
  },

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: googleClientId as string,
          clientSecret: googleClientSecret as string,
        },
      }
    : {},

  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'VIEWER',
        input: false,
      },
      isActive: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
        input: true,
      },
      employeeCode: {
        type: 'string',
        required: false,
        input: false,
      },
      activatedAt: {
        type: 'date',
        required: false,
        input: false,
      },
      activatedById: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          })

          if (!user?.isActive) {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_NOT_ACTIVATED',
              message:
                'Your account is awaiting administrator approval. You will be able to sign in once it is activated.',
            })
          }

          return { data: session }
        },
      },
    },
  },

  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
