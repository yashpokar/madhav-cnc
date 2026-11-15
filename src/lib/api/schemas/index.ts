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
})

export const companySummary = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  capabilities: z.array(z.string()),
  industry: z.string(),
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
