import { z } from 'zod'
import { INDUSTRY_KEYS } from '@/lib/industry'
import { PAID_PLANS } from '@/lib/billing/plans'
import { UserRole } from '@/generated/prisma/enums'

// Account, team, invitations, billing history, search and export.

const role = z.enum(UserRole)

export const industryTemplate = z.object({
  key: z.enum(INDUSTRY_KEYS),
  label: z.string(),
  description: z.string(),
  units: z.array(z.string()).describe('Units of measure offered first, in this order'),
  defaultUnits: z.record(z.string(), z.string()).describe('Starting unit per item type'),
  stages: z.array(z.object({ name: z.string(), linkedStatus: z.string().nullable() })),
  expenseCategories: z.array(z.string()),
  defaultGstRate: z.number(),
  modules: z.object({ production: z.boolean(), dispatch: z.boolean(), partners: z.boolean() }),
  terms: z.object({ orders: z.string(), order: z.string() }),
})

export const teamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role,
  isSuperAdmin: z.boolean().describe('A platform administrator (cannot be changed here)'),
})

export const addMemberBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role,
})

export const memberRoleBody = z.object({ role })

export const memberRemovedResponse = z.object({ id: z.string(), removed: z.literal(true) })

export const invitationBody = z.object({
  role,
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address')]).optional(),
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(120).optional(),
})

export const invitation = z.object({
  id: z.string(),
  role,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  status: z.string().describe('PENDING, EXPIRED, ACCEPTED or REVOKED'),
  expiresAt: z.string(),
  createdAt: z.string(),
  token: z.string(),
  url: z.string().describe('The join link to send'),
  whatsappText: z.string(),
  whatsappLink: z.string().describe('Opens WhatsApp (the invitation phone when given) with the message filled in'),
})

export const invitationPreviewQuery = z.object({ token: z.string().min(1).max(200) })

export const invitationPreview = z.object({
  companyName: z.string(),
  role,
  inviterName: z.string().nullable(),
  emailHint: z.string().nullable(),
  expiresAt: z.string(),
  status: z.string(),
  usable: z.boolean().describe('False when it was used, revoked or lapsed (accepting would be refused)'),
})

export const billingPayment = z.object({
  id: z.string(),
  plan: z.string(),
  amount: z.string().describe('Rupees, decimal string'),
  status: z.string(),
  providerPaymentId: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
})

export const checkoutBody = z.object({ plan: z.enum(PAID_PLANS) })

export const checkoutResponse = z.object({
  paymentId: z.string(),
  redirectUrl: z.string().describe('Open in the system browser; the plan changes when the payment settles'),
})

export const searchQuery = z.object({ q: z.string().trim().max(100).default('') })

export const searchHit = z.object({
  id: z.string(),
  group: z.string(),
  title: z.string(),
  subtitle: z.string(),
  type: z.enum(['customer', 'partner', 'item', 'quotation', 'order', 'invoice']),
  recordId: z.string().describe('The id to open with the matching GET /{type}s/{id}'),
})

export const exportQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
})
