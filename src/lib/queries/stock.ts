import { prisma } from '@/lib/prisma'
import {
  averageCost,
  matchesStockFilter,
  onHand,
  runningBalance,
  stockState,
  stockValue,
  type MovementType,
  type StockFilter,
  type StockState,
} from '@/lib/stock-rules'

export type StockKind = 'item' | 'material'

export type StockRow = {
  kind: StockKind
  id: string
  name: string
  code: string | null
  unit: string | null
  onHand: number
  averageCost: number
  value: number
  reorderLevel: number | null
  state: StockState
}

const num = (value: { toNumber: () => number } | null) => (value ? value.toNumber() : null)

/** Everything that is tracked for stock, with on-hand, average cost and value. */
export async function listStock({
  search,
  filter = 'all',
}: { search?: string; filter?: StockFilter } = {}): Promise<StockRow[]> {
  const term = search?.trim().toLowerCase()

  const [items, materials, movements] = await Promise.all([
    prisma.item.findMany({
      where: { stockTracked: true },
      select: { id: true, code: true, name: true, unit: true, reorderLevel: true },
    }),
    prisma.material.findMany({
      where: { stockTracked: true },
      select: { id: true, name: true, reorderLevel: true },
    }),
    prisma.stockMovement.findMany({
      select: { itemId: true, materialId: true, type: true, qty: true, unitCost: true },
    }),
  ])

  const byKey = new Map<string, { type: MovementType; qty: number; unitCost: number }[]>()

  for (const movement of movements) {
    const key = movement.itemId ? `item:${movement.itemId}` : `material:${movement.materialId}`
    const list = byKey.get(key) ?? []

    list.push({
      type: movement.type,
      qty: movement.qty.toNumber(),
      unitCost: movement.unitCost.toNumber(),
    })
    byKey.set(key, list)
  }

  const bases: Omit<StockRow, 'onHand' | 'averageCost' | 'value' | 'state'>[] = [
    ...items.map((item) => ({
      kind: 'item' as const,
      id: item.id,
      name: item.name,
      code: item.code as string | null,
      unit: item.unit as string | null,
      reorderLevel: num(item.reorderLevel),
    })),
    ...materials.map((material) => ({
      kind: 'material' as const,
      id: material.id,
      name: material.name,
      code: null,
      unit: null,
      reorderLevel: num(material.reorderLevel),
    })),
  ]

  const rows: StockRow[] = bases.map((base) => {
    const list = byKey.get(`${base.kind}:${base.id}`) ?? []
    const have = onHand(list)
    const average = averageCost(list)

    return {
      ...base,
      onHand: have,
      averageCost: average,
      value: stockValue(have, average),
      state: stockState(have, base.reorderLevel),
    }
  })

  return rows
    .filter((row) => matchesStockFilter(row.state, filter))
    .filter(
      (row) =>
        !term || row.name.toLowerCase().includes(term) || (row.code ?? '').toLowerCase().includes(term),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** How many tracked things with a reorder level are at or below it. */
export async function countLowStock() {
  const rows = await listStock({ filter: 'low' })

  return rows.filter((row) => row.reorderLevel !== null && row.reorderLevel > 0).length
}

export async function getStockSubject(kind: StockKind, id: string) {
  if (kind === 'item') {
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, unit: true, stockTracked: true, reorderLevel: true },
    })

    return item
      ? {
          kind,
          id: item.id,
          name: item.name,
          code: item.code as string | null,
          unit: item.unit as string | null,
          stockTracked: item.stockTracked,
          reorderLevel: num(item.reorderLevel),
        }
      : null
  }

  const material = await prisma.material.findUnique({
    where: { id },
    select: { id: true, name: true, stockTracked: true, reorderLevel: true },
  })

  return material
    ? {
        kind,
        id: material.id,
        name: material.name,
        code: null as string | null,
        unit: null as string | null,
        stockTracked: material.stockTracked,
        reorderLevel: num(material.reorderLevel),
      }
    : null
}

/** The ledger of one thing: oldest first with a running balance. */
export async function getStockLedger(kind: StockKind, id: string) {
  const movements = await prisma.stockMovement.findMany({
    where: kind === 'item' ? { itemId: id } : { materialId: id },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      type: true,
      qty: true,
      unitCost: true,
      date: true,
      reference: true,
      note: true,
      receiptLine: { select: { receiptId: true } },
    },
  })

  // A reversal has no receipt line of its own; its reference is the receipt number.
  const numbers = [
    ...new Set(
      movements
        .filter((m) => m.type === 'PURCHASE_RETURN' && m.reference)
        .map((m) => m.reference as string),
    ),
  ]
  const receipts = numbers.length
    ? await prisma.goodsReceipt.findMany({
        where: { number: { in: numbers } },
        select: { id: true, number: true },
      })
    : []
  const receiptByNumber = new Map(receipts.map((receipt) => [receipt.number, receipt.id]))

  const plain = movements.map((m) => ({
    id: m.id,
    type: m.type as MovementType,
    qty: m.qty.toNumber(),
    unitCost: m.unitCost.toNumber(),
    date: m.date,
    reference: m.reference,
    note: m.note,
    receiptId:
      m.receiptLine?.receiptId ??
      (m.type === 'PURCHASE_RETURN' && m.reference ? (receiptByNumber.get(m.reference) ?? null) : null),
  }))

  const have = onHand(plain)
  const average = averageCost(plain)

  return {
    rows: runningBalance(plain),
    onHand: have,
    averageCost: average,
    value: stockValue(have, average),
    hasOpening: plain.some((m) => m.type === 'OPENING'),
  }
}
