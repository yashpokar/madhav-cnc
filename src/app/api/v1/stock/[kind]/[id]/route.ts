import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { day, decimal, decimalOrNull, money } from '@/lib/api/reads/format'
import { getStockLedger, getStockSubject, type StockKind } from '@/lib/queries/stock'

/** The ledger of one item or material, oldest first with a running balance. */
export const GET = apiRoute({ auth: 'company', capability: 'stock:read' }, async ({ request, params }) => {
  const kind = params.kind as StockKind

  if (kind !== 'item' && kind !== 'material') throw new ApiError('NOT_FOUND', 'Stock record not found.')

  const subject = await getStockSubject(kind, params.id)

  if (!subject) throw new ApiError('NOT_FOUND', 'Stock record not found.')

  const ledger = await getStockLedger(kind, params.id)

  return replyWithEtag(request, {
    subject: {
      kind: subject.kind,
      id: subject.id,
      name: subject.name,
      code: subject.code,
      unit: subject.unit,
      stockTracked: subject.stockTracked,
      reorderLevel: decimalOrNull(subject.reorderLevel),
    },
    onHand: decimal(ledger.onHand),
    averageCost: decimal(ledger.averageCost),
    value: money(ledger.value),
    hasOpening: ledger.hasOpening,
    movements: ledger.rows.map((row) => ({
      id: row.id,
      type: row.type,
      date: day(row.date),
      qty: decimal(row.qty),
      unitCost: row.unitCost.toFixed(4),
      balance: decimal(row.balance),
      reference: row.reference,
      note: row.note,
      receiptId: row.receiptId,
    })),
  })
})
