import { z } from 'zod'
import { INDUSTRY_KEYS } from '@/lib/industry'
import { UserRole } from '@/generated/prisma/enums'

// The request and response shapes of the v1 endpoints. Pure zod, so the route
// handlers, the OpenAPI generator and the tests all share one definition.

export const roleSchema = z.enum(UserRole)

export const metaResponse = z.object({
  apiVersion: z.literal('1'),
  minAppVersion: z.object({ ios: z.string(), android: z.string() }),
  latestAppVersion: z.string(),
  maintenance: z.boolean(),
  release: z.object({
    version: z.string(),
    commit: z.string(),
    builtAt: z.string().nullable(),
  }),
})

export const companySummary = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  capabilities: z.array(z.string()),
  industry: z.string(),
  industryName: z.string().describe('Display name of the industry template'),
  terms: z.object({ orders: z.string(), order: z.string() }).describe('What this company calls an order, e.g. Bookings / Booking'),
  modules: z
    .object({ production: z.boolean(), dispatch: z.boolean(), partners: z.boolean() })
    .describe('Optional areas of the app this industry uses (a hidden one stays reachable)'),
})

export const meResponse = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    globalRole: roleSchema,
    isSuperAdmin: z.boolean(),
  }),
  companies: z.array(companySummary),
})

export const permissionsResponse = z.object({
  companyId: z.string(),
  role: roleSchema,
  capabilities: z.array(z.string()),
})

export const createCompanyBody = z.object({
  companyName: z.string().min(1).max(150),
  industry: z.enum(INDUSTRY_KEYS),
  gstin: z.string().max(15).optional(),
  phone: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
})

export const createCompanyResponse = z.object({ company: companySummary })

export const acceptInvitationBody = z.object({ token: z.string().min(1).max(200) })

export const acceptInvitationResponse = z.object({
  companyId: z.string(),
  role: roleSchema,
  alreadyMember: z.boolean(),
  message: z.string(),
})

export const deleteMeResponse = z.object({ deleted: z.literal(true) })

export const billingResponse = z.object({
  plan: z.enum(['FREE', 'BUSINESS', 'BUSINESS_PRO']),
  /** FREE, ACTIVE, EXPIRING, GRACE or EXPIRED. */
  state: z.enum(['FREE', 'ACTIVE', 'EXPIRING', 'GRACE', 'EXPIRED']),
  entitlements: z.object({
    /** Issued invoices allowed over the company's lifetime; null = unlimited. */
    invoiceQuota: z.number().int().nullable(),
    aiPreview: z.boolean(),
  }),
  usage: z.object({
    invoicesIssued: z.number().int(),
    /** Invoices left on the free quota; null = unlimited. */
    remaining: z.number().int().nullable(),
  }),
  /** When the current paid year ends (ISO 8601); null for no expiry or the free plan. */
  renewsOn: z.string().nullable(),
  /** Whether the limit is actually enforced (BILLING_ENFORCED). */
  enforced: z.boolean(),
  /** Where to manage the plan. The apps only show status and link here; plans are not sold in-app. */
  manageUrl: z.string(),
})
