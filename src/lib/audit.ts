import type { PrismaClient } from '@/generated/prisma/client'

type Spec = {
  entity: string
  label: string
  /** Operations to record. Documents already log their own edits. */
  ops: readonly ('create' | 'update' | 'delete' | 'upsert')[]
  name: (row: Record<string, unknown>) => string | null
  /** Only record an update if it touches one of these fields. */
  onlyFields?: readonly string[]
}

const text = (...values: unknown[]) => {
  const found = values.find((v) => typeof v === 'string' && v.trim())

  return typeof found === 'string' ? found.trim() : null
}

const all = ['create', 'update', 'delete', 'upsert'] as const
const gone = ['delete'] as const

/**
 * Which tables are recorded, and how a row is named. Master data and money
 * records are logged here, at the database, so no action can forget to.
 * Quotations, orders, invoices, dispatches, notes and receipts record their
 * own create/update steps with richer wording, so only their deletion is
 * picked up here (the record and its page are gone, but the line remains in
 * the Activity log).
 */
const SPECS: Record<string, Spec> = {
  Expense: { entity: 'expense', label: 'expense', ops: all, name: (r) => text(r.number, r.payeeName) },
  ExpenseCategory: { entity: 'expense-category', label: 'expense category', ops: all, name: (r) => text(r.name) },
  CashCredit: { entity: 'cash-credit', label: 'credit entry', ops: all, name: (r) => text(r.sourceName) },
  Item: { entity: 'item', label: 'item', ops: all, name: (r) => text(r.name, r.code) },
  Material: { entity: 'material', label: 'material', ops: all, name: (r) => text(r.name) },
  Partner: { entity: 'partner', label: 'partner', ops: all, name: (r) => text(r.name, r.code) },
  DayClose: {
    entity: 'day-close',
    label: 'day-end check',
    ops: ['create', 'delete'],
    name: (r) => (r.closeDate instanceof Date ? r.closeDate.toISOString().slice(0, 10) : null),
  },
  BankAccount: { entity: 'bank-account', label: 'bank account', ops: all, name: (r) => text(r.name) },
  CashDenomination: {
    entity: 'denomination',
    label: 'note denomination',
    ops: all,
    name: (r) => (typeof r.value === 'number' ? `₹${r.value}` : null),
  },
  ProductionStage: { entity: 'stage', label: 'production stage', ops: all, name: (r) => text(r.name) },
  CompanySetting: { entity: 'company', label: 'company settings', ops: all, name: () => null },
  User: {
    entity: 'user',
    label: 'user',
    ops: ['create', 'update', 'delete'],
    name: (r) => text(r.name, r.email),
    onlyFields: ['role', 'isActive'],
  },
  Quotation: { entity: 'quotation', label: 'quotation', ops: gone, name: (r) => text(r.number) },
  Order: { entity: 'order', label: 'order', ops: gone, name: (r) => text(r.number) },
  Invoice: { entity: 'invoice', label: 'invoice', ops: gone, name: (r) => text(r.number) },
  Dispatch: { entity: 'dispatch', label: 'challan', ops: gone, name: (r) => text(r.number) },
  CreditDebitNote: { entity: 'note', label: 'note', ops: gone, name: (r) => text(r.number) },
  Customer: { entity: 'customer', label: 'customer', ops: gone, name: (r) => text(r.name, r.code) },
  Payment: { entity: 'payment', label: 'receipt', ops: gone, name: (r) => text(r.number) },
}

const NOISE = new Set(['updatedAt', 'createdAt', 'updatedById', 'password'])

const words = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/ id$/, '')

function changedFields(data: unknown) {
  if (!data || typeof data !== 'object') return []

  return Object.keys(data as object).filter((key) => !NOISE.has(key))
}

async function currentActor() {
  try {
    // Loaded lazily: session -> auth -> prisma would otherwise be a cycle.
    const { getCurrentUser } = await import('@/lib/session')
    const user = await getCurrentUser()

    return user ? { id: user.id, name: user.name } : null
  } catch {
    // Outside a request (seed script, auth callbacks): no signed-in person.
    return null
  }
}

/** Extends a Prisma client so writes to the tables above leave a log line. */
export function withAudit(base: PrismaClient) {
  return base.$extends({
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          const spec = SPECS[model]

          if (!spec || !(spec.ops as readonly string[]).includes(operation)) {
            return result
          }

          try {
            const row = (result ?? {}) as Record<string, unknown>
            const data = (args as { data?: unknown; update?: unknown }).data ??
              (args as { update?: unknown }).update
            const fields = changedFields(data)

            if (
              operation === 'update' &&
              (fields.length === 0 ||
                (spec.onlyFields && !fields.some((f) => spec.onlyFields!.includes(f))))
            ) {
              return result
            }

            const name = spec.name(row)
            const subject = name ? `${spec.label} “${name}”` : spec.label
            const verb =
              operation === 'create'
                ? 'added'
                : operation === 'delete'
                  ? 'deleted'
                  : operation === 'upsert'
                    ? 'saved'
                    : 'updated'
            const detail =
              operation === 'update' || operation === 'upsert'
                ? fields.length
                  ? ` (changed ${fields.map(words).join(', ')})`
                  : ''
                : ''
            const actor =
              (await currentActor()) ??
              (model === 'User' && typeof row.name === 'string'
                ? { id: String(row.id), name: row.name }
                : null)

            await base.activityLog.create({
              data: {
                entityType: spec.entity,
                entityId: String(row.id ?? ''),
                action: operation === 'delete' ? 'deleted' : operation === 'create' ? 'created' : 'updated',
                summary: `${verb} ${subject}${detail}`,
                userId: actor?.id ?? null,
                userName: actor?.name ?? 'System',
              },
            })
          } catch {
            // The trail must never get in the way of the change itself.
          }

          return result
        },
      },
    },
  })
}
