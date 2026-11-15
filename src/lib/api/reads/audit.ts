import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { decodeCursor, encodeCursor } from '@/lib/api/cursor'
import { historyQuery } from '@/lib/api/schemas/audit'
import type { AuditEventOut } from '@/lib/api/schemas/audit'
import { fieldChanges, type Json } from '@/lib/audit-trail/diff'
import { API_HISTORY_ENTITIES, AUDIT_MODELS, modelLabel, type ApiHistoryEntity } from '@/lib/audit-trail/model-map'
import { entityHistory, type AuditEventView } from '@/lib/audit-trail/queries'
import { prisma } from '@/lib/prisma'

/** The sequence number inside a page cursor (an audit cursor is `[seq, id]`). */
export function seqOfCursor(cursor: string | undefined): bigint | null {
  if (!cursor) return null

  const { k } = decodeCursor(cursor)

  if (!/^\d{1,18}$/.test(String(k))) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid cursor', { fields: { cursor: 'Not a valid cursor' } })
  }

  return BigInt(String(k))
}

/** An audit event as the API sends it. Values are the raw JSON snapshots, not display text. */
export function auditEventOut(event: AuditEventView): AuditEventOut {
  return {
    id: event.id,
    seq: event.seq,
    occurredAt: event.occurredAt.toISOString(),
    actor: { id: event.actorUserId, name: event.actorName, role: event.actorRole },
    source: event.source,
    requestId: event.requestId,
    entityType: event.entityType,
    entityLabel: modelLabel(event.entityType),
    entityId: event.entityId,
    parentType: event.parentType,
    parentId: event.parentId,
    action: event.action as AuditEventOut['action'],
    summary: event.summary,
    reason: event.reason,
    correlationId: event.correlationId,
    changes: fieldChanges(event).map((change) => ({
      field: change.field,
      label: change.label,
      before: (change.before ?? null) as Json | null,
      after: (change.after ?? null) as Json | null,
    })),
  }
}

type Exists = { findUnique: (args: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null> }

const DELEGATES: Record<string, string> = {
  Customer: 'customer',
  Quotation: 'quotation',
  Order: 'order',
  Invoice: 'invoice',
  Payment: 'payment',
  Expense: 'expense',
  Vendor: 'vendor',
  PurchaseBill: 'purchaseBill',
}

/**
 * GET /{entity}/{id}/history: every change to one record (and its line items),
 * newest first. Needs the capability to read that kind of record. The record
 * must belong to the caller's company, or have events there (a deleted record
 * keeps its history); anything else is 404, the same as for another company's.
 */
export function historyRoute(entity: ApiHistoryEntity) {
  const model = API_HISTORY_ENTITIES[entity]

  return apiRoute(
    { auth: 'company', capability: AUDIT_MODELS[model].read, query: historyQuery },
    async ({ params, query, companyId }) => {
      const limit = Math.min(query.limit, 100)
      const before = seqOfCursor(query.cursor)
      const rows = await entityHistory(companyId, model, params.id, { limit: limit + 1, before })

      if (rows.length === 0 && before === null) {
        // Scoped by the tenant extension: another company's record is "not found".
        const delegate = (prisma as unknown as Record<string, Exists>)[DELEGATES[model]]
        const found = await delegate.findUnique({ where: { id: params.id }, select: { id: true } })

        if (!found) throw new ApiError('NOT_FOUND', `${modelLabel(model)} not found.`)
      }

      const items = rows.slice(0, limit)
      const hasMore = rows.length > limit
      const last = items[items.length - 1]

      return reply(items.map(auditEventOut), {
        meta: { nextCursor: hasMore && last ? encodeCursor({ k: last.seq, id: last.id }) : null, hasMore },
      })
    },
  )
}
