import { actionLabel, fieldChanges, formatValue, sourceBadge, type Json } from '@/lib/audit-trail/diff'
import { modelLabel } from '@/lib/audit-trail/model-map'

/** An audit event as the History drawer and the Audit log page show it (all plain, serialisable values). */
export type HistoryEntry = {
  id: string
  seq: string
  occurredAt: string
  actorName: string
  actorRole: string | null
  source: string
  sourceLabel: string
  sourceColor: string
  action: string
  actionLabel: string
  entityType: string
  entityLabel: string
  entityId: string
  /** A line item of the record being viewed (shown under its document). */
  isChild: boolean
  summary: string
  reason: string | null
  correlationId: string
  requestId: string | null
  ip: string | null
  changes: { label: string; before: string | null; after: string | null }[]
  /** How many more fields the event has than are listed. */
  moreChanges: number
}

type EventLike = {
  id: string
  seq: string
  occurredAt: Date
  actorName: string
  actorRole: string | null
  source: string
  action: string
  entityType: string
  entityId: string
  parentType: string | null
  summary: string
  reason: string | null
  correlationId: string
  requestId: string | null
  ip: string | null
  before: Json | null
  after: Json | null
  changedFields: string[]
}

const MAX_FIELDS = 14

export function presentEvent(event: EventLike, viewing?: { type: string; id: string }): HistoryEntry {
  const all = fieldChanges(event)
  const shown = all.slice(0, MAX_FIELDS)
  const badge = sourceBadge(event.source)

  return {
    id: event.id,
    seq: event.seq,
    occurredAt: event.occurredAt.toISOString(),
    actorName: event.actorName,
    actorRole: event.actorRole,
    source: event.source,
    sourceLabel: badge.label,
    sourceColor: badge.color,
    action: event.action,
    actionLabel: actionLabel(event.action),
    entityType: event.entityType,
    entityLabel: modelLabel(event.entityType),
    entityId: event.entityId,
    isChild: Boolean(viewing && (event.entityType !== viewing.type || event.entityId !== viewing.id) && event.parentType),
    summary: event.summary,
    reason: event.reason,
    correlationId: event.correlationId,
    requestId: event.requestId,
    ip: event.ip,
    changes: shown.map((change) => ({
      label: change.label,
      before: change.before === undefined ? null : formatValue(change.before, change.field),
      after: change.after === undefined ? null : formatValue(change.after, change.field),
    })),
    moreChanges: Math.max(0, all.length - shown.length),
  }
}
