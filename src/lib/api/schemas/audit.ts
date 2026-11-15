import { z } from 'zod'
import { AUDIT_SOURCES } from '@/lib/audit-trail/context'
import { idSchema, instant, pageQuery } from '@/lib/api/schemas/reads'

// The audit trail over the API (docs/mobile-api.md, "Audit trail"): the
// company's log for administrators, and the history of one record.

const ACTIONS = ['create', 'update', 'delete', 'status', 'restore', 'baseline'] as const

export const auditQuery = pageQuery.extend({
  entity: z.string().trim().max(40).optional().describe('Record type, e.g. "Invoice" or "PurchaseBill"'),
  entityId: z.string().trim().max(64).optional().describe('One record'),
  actor: z.string().trim().max(64).optional().describe('User id of the person'),
  action: z.enum(ACTIONS).optional(),
  source: z.enum(AUDIT_SOURCES as [string, ...string[]]).optional().describe('Where the change came from'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(100).optional().describe('A record number or id, a person, or words from the summary'),
})

/** History of one record: newest first, at most 100 events per page. */
export const historyQuery = pageQuery

const fieldChange = z.object({
  field: z.string().describe('The column, e.g. "total_amount"'),
  label: z.string().describe('A readable name, e.g. "Total amount"'),
  before: z.unknown().nullable().describe('Absent on a create'),
  after: z.unknown().nullable().describe('Absent on a delete'),
})

export const auditEvent = z.object({
  id: idSchema,
  seq: z.string().describe('Position in the company chain; strictly increasing'),
  occurredAt: instant,
  actor: z.object({
    id: z.string().nullable(),
    name: z.string().describe('The name at the time (kept even if the person is later renamed or removed)'),
    role: z.string().nullable(),
  }),
  source: z.enum(AUDIT_SOURCES as [string, ...string[]]).describe('web | api | mobile | system | webhook | seed | public'),
  requestId: z.string().nullable(),
  entityType: z.string(),
  entityLabel: z.string(),
  entityId: z.string(),
  parentType: z.string().nullable().describe('For a line item: the document it belongs to'),
  parentId: z.string().nullable(),
  action: z.enum(ACTIONS),
  summary: z.string(),
  reason: z.string().nullable().describe('Why, when the person gave a reason (always set on deleting money records)'),
  correlationId: z.string().describe('Events changed together share this'),
  changes: z.array(fieldChange),
})

export type AuditEventOut = z.output<typeof auditEvent>
