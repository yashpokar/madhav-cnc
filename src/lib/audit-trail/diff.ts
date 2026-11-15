import { AUDITED } from '@/lib/audit-trail/registry'

/**
 * Presentation helpers for audit events: which fields changed, how a value
 * reads, what the source badge says. Pure, so they are unit-tested and shared
 * by the History drawer, the Audit log page, the CSV export and the API.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type FieldChange = {
  /** The database column, e.g. `company_name`. */
  field: string
  label: string
  before: Json | undefined
  after: Json | undefined
}

/** Columns that are bookkeeping rather than something a person changed. */
const HIDDEN = new Set(['updated_at', 'updated_by_id', 'created_at', 'created_by_id', 'company_id', 'id'])

const ACRONYMS: Record<string, string> = {
  gst: 'GST',
  gstin: 'GSTIN',
  pan: 'PAN',
  ifsc: 'IFSC',
  upi: 'UPI',
  utr: 'UTR',
  hsn: 'HSN',
  igst: 'IGST',
  cgst: 'CGST',
  sgst: 'SGST',
  qty: 'Qty',
  id: 'ID',
  url: 'URL',
}

/** `company_name` -> "Company name"; `customer_id` -> "Customer". */
export function fieldLabel(column: string): string {
  const words = column.replace(/_id$/, '').split('_').filter(Boolean)
  const text = words.map((w) => ACRONYMS[w] ?? w).join(' ')

  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** `PurchaseBill` -> "Purchase bill". */
export function entityLabel(entityType: string): string {
  const text = entityType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()

  return text.charAt(0).toUpperCase() + text.slice(1)
}

function asRecord(value: unknown): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, Json>) : {}
}

type EventShape = {
  action: string
  before: unknown
  after: unknown
  changedFields: readonly string[]
}

/**
 * The field-level before -> after list for one event. An update lists the
 * columns that changed; a create lists what was set (before is undefined); a
 * delete lists what was removed (after is undefined). Housekeeping columns are
 * left out unless `all`.
 */
export function fieldChanges(event: EventShape, options: { all?: boolean } = {}): FieldChange[] {
  const before = asRecord(event.before)
  const after = asRecord(event.after)
  const fields =
    event.changedFields.length > 0 ? event.changedFields : [...new Set([...Object.keys(before), ...Object.keys(after)])]

  return fields
    .filter((field) => options.all || !HIDDEN.has(field))
    .map((field) => ({
      field,
      label: fieldLabel(field),
      before: event.action === 'create' ? undefined : before[field],
      after: event.action === 'delete' ? undefined : after[field],
    }))
}

const MONEY = /(amount|total|price|rate|balance|paid|due|subtotal|discount|tax|cost|charge)/i
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

/** A value as a short readable string (never throws). */
export function formatValue(value: Json | undefined, field = ''): string {
  if (value === undefined) return ''
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'number') {
    return MONEY.test(field) ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value)
  }

  if (typeof value === 'string') {
    if (value === '') return '(empty)'

    if (ISO.test(value)) {
      const date = new Date(value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().replace('T', ' ').replace(/:\d{2}(\.\d+)?Z$/, ' UTC').replace(' 00:00 UTC', '')
      }
    }

    if (MONEY.test(field) && /^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    }

    return value.length > 200 ? `${value.slice(0, 200)}…` : value
  }

  const text = JSON.stringify(value)

  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

export const SOURCE_BADGES = {
  web: { label: 'Web', color: 'blue' },
  api: { label: 'API', color: 'violet' },
  mobile: { label: 'App', color: 'teal' },
  system: { label: 'System', color: 'zinc' },
  webhook: { label: 'Webhook', color: 'amber' },
  seed: { label: 'Seed', color: 'zinc' },
  public: { label: 'Public link', color: 'orange' },
} as const

export type SourceKey = keyof typeof SOURCE_BADGES

export function sourceBadge(source: string): { label: string; color: (typeof SOURCE_BADGES)[SourceKey]['color'] } {
  return SOURCE_BADGES[source as SourceKey] ?? { label: source, color: 'zinc' }
}

export const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  status: 'Status changed',
  restore: 'Restored',
  baseline: 'Baseline',
}

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action
}

/** Masks a snapshot's secret columns (defence in depth: the database already does). */
export function redactSnapshot(model: string, row: unknown): unknown {
  const secrets = AUDITED[model]?.secrets

  if (!secrets || !row || typeof row !== 'object' || Array.isArray(row)) return row

  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) }

  for (const secret of secrets) {
    const column = secret.replace(/~$/, '')
    const value = copy[column]

    if (value === undefined || value === null) continue

    copy[column] = secret.endsWith('~') ? `••••${String(value).slice(-4)}` : '[redacted]'
  }

  return copy
}
