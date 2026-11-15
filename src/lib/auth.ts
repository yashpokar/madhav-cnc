import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { bearer } from 'better-auth/plugins'
import { prisma } from '@/lib/prisma'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleEnabled = Boolean(googleClientId && googleClientSecret)

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS !== 'false'

const configuredOrigins = [
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

// The native apps (Expo) call from the prodlys:// scheme. Harmless for web.
const appSchemeOrigins = ['prodlys://', 'prodlys://*']

const trustedOrigins = allowAllOrigins
  ? ['*', 'http://*', 'https://*', ...configuredOrigins, ...appSchemeOrigins]
  : [...configuredOrigins, ...appSchemeOrigins]

export const auth = betterAuth({
  appName: 'Prodlys',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  // Cloudflare sits in front of the app and sets a single-value client address
  // header. Without naming it, Better Auth cannot tell visitors apart and every
  // sign-in attempt from anyone counts against one shared rate-limit bucket.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip'],
    },
  },

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
    // Phones stay signed in for a month; web visitors get the same session.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true, activatedAt: true },
          })

          // A brand-new account may sign in: it has no access to anything until
          // it creates a company or is added to one (see requireUser). Only an
          // account a platform administrator deactivated (it was activated
          // once) is turned away.
          if (!user || (!user.isActive && user.activatedAt)) {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_NOT_ACTIVATED',
              message: 'Your account has been deactivated. Contact an administrator.',
            })
          }

          return { data: session }
        },
      },
    },
  },

  // bearer() lets the mobile apps send `Authorization: Bearer <token>` (the token
  // is returned in the `set-auth-token` header of sign-in). nextCookies() must
  // stay last.
  plugins: [bearer(), nextCookies()],
})

export type Session = typeof auth.$Infer.Session
