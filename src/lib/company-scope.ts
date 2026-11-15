import type { withAudit } from '@/lib/audit'
import { getActiveCompanyId } from '@/lib/active-company'

/**
 * Tables whose rows belong to one company. Lines and other children are
 * reached through their parent, so they are not listed.
 */
const SCOPED = new Set([
  'Partner',
  'Customer',
  'Material',
  'Item',
  'Quotation',
  'Order',
  'ProductionStage',
  'Dispatch',
  'Invoice',
  'Payment',
  'PaymentChannel',
  'ExpenseCategory',
  'Expense',
  'CreditDebitNote',
  'Vendor',
  'PurchaseOrder',
  'PurchaseBill',
  'GoodsReceipt',
  'StockMovement',
  'VendorPayment',
  'ChannelOpeningBalance',
  'ActivityLog',
])

const FILTERED = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
])

type Args = {
  where?: Record<string, unknown>
  data?: unknown
  create?: Record<string, unknown>
}

/**
 * Keeps every query inside the active company: reads and changes only see its
 * rows, and new rows are filed under it. This is the one place that knows
 * about companies, so no action or page can forget to filter. The activity log
 * also shows entries that belong to no company (people being added, say).
 */
export function withCompanyScope(base: ReturnType<typeof withAudit>) {
  return base.$extends({
    name: 'company-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED.has(model)) return query(args)

          const companyId = await getActiveCompanyId()

          if (!companyId) return query(args)

          const next = { ...(args as Args) }

          if (FILTERED.has(operation)) {
            const where = next.where ?? {}

            if (!('companyId' in where)) {
              next.where =
                model === 'ActivityLog' && operation !== 'upsert'
                  ? { AND: [where, { OR: [{ companyId }, { companyId: null }] }] }
                  : { ...where, companyId }
            }
          }

          if (operation === 'create' && next.data && !Array.isArray(next.data)) {
            next.data = { companyId, ...(next.data as object) }
          }

          if (
            (operation === 'createMany' || operation === 'createManyAndReturn') &&
            Array.isArray(next.data)
          ) {
            next.data = next.data.map((row) => ({ companyId, ...(row as object) }))
          }

          if (operation === 'upsert' && next.create) {
            next.create = { companyId, ...next.create }
          }

          return query(next as typeof args)
        },
      },
    },
  })
}
