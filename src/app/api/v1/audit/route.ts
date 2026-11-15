import { apiRoute, reply } from '@/lib/api/handler'
import { encodeCursor } from '@/lib/api/cursor'
import { auditEventOut, seqOfCursor } from '@/lib/api/reads/audit'
import { auditQuery } from '@/lib/api/schemas/audit'
import { listAuditEventsAfter } from '@/lib/audit-trail/queries'

/**
 * The company's audit log, newest first (cursor pagination), for administrators
 * (settings:update). Filters: entity, entityId, actor, action, source, from/to
 * (UTC days, inclusive) and q (record number or id, person, words).
 */
export const GET = apiRoute(
  { auth: 'company', capability: 'settings:update', query: auditQuery },
  async ({ query, companyId }) => {
    const rows = await listAuditEventsAfter(
      companyId,
      {
        entityType: query.entity,
        entityId: query.entityId,
        actorUserId: query.actor,
        action: query.action,
        source: query.source,
        from: query.from,
        to: query.to,
        q: query.q,
      },
      seqOfCursor(query.cursor),
      query.limit + 1,
    )
    const items = rows.slice(0, query.limit)
    const hasMore = rows.length > query.limit
    const last = items[items.length - 1]

    return reply(items.map(auditEventOut), {
      meta: { nextCursor: hasMore && last ? encodeCursor({ k: last.seq, id: last.id }) : null, hasMore },
    })
  },
)
