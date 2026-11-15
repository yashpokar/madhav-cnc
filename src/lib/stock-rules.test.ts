import { describe, expect, it } from 'vitest'
import {
  averageCost,
  derivePoStatus,
  matchesStockFilter,
  negativeStockGuard,
  onHand,
  remainingToReceive,
  reversalMovements,
  runningBalance,
  stockKey,
  stockState,
  stockValue,
  totalsByKey,
  unitCostFromTaxable,
} from '@/lib/stock-rules'

describe('onHand', () => {
  it('sums signed movements', () => {
    expect(onHand([{ qty: 10 }, { qty: -3.5 }, { qty: 0.25 }])).toBe(6.75)
    expect(onHand([])).toBe(0)
  })
  it('does not drift on decimals', () => {
    expect(onHand([{ qty: 0.1 }, { qty: 0.2 }])).toBe(0.3)
  })
})

describe('averageCost', () => {
  it('weights purchases by quantity', () => {
    expect(
      averageCost([
        { type: 'PURCHASE', qty: 10, unitCost: 100 },
        { type: 'PURCHASE', qty: 30, unitCost: 120 },
      ]),
    ).toBe(115)
  })
  it('counts opening stock', () => {
    expect(
      averageCost([
        { type: 'OPENING', qty: 5, unitCost: 10 },
        { type: 'PURCHASE', qty: 5, unitCost: 20 },
      ]),
    ).toBe(15)
  })
  it('leaves the average alone when a receipt is reversed at its own cost', () => {
    expect(
      averageCost([
        { type: 'PURCHASE', qty: 10, unitCost: 100 },
        { type: 'PURCHASE', qty: 10, unitCost: 200 },
        { type: 'PURCHASE_RETURN', qty: -10, unitCost: 200 },
      ]),
    ).toBe(100)
  })
  it('ignores adjustments and issues', () => {
    expect(
      averageCost([
        { type: 'PURCHASE', qty: 10, unitCost: 50 },
        { type: 'ADJUSTMENT', qty: 100, unitCost: 0 },
        { type: 'ISSUE', qty: -4, unitCost: 0 },
      ]),
    ).toBe(50)
  })
  it('is zero with nothing costed', () => {
    expect(averageCost([])).toBe(0)
    expect(averageCost([{ type: 'ADJUSTMENT', qty: 3, unitCost: 0 }])).toBe(0)
  })
})

describe('stockValue and stockState', () => {
  it('values on-hand at the average, never negative', () => {
    expect(stockValue(4, 12.5)).toBe(50)
    expect(stockValue(-2, 12.5)).toBe(0)
  })
  it('classifies stock', () => {
    expect(stockState(-1, 5)).toBe('negative')
    expect(stockState(0, 5)).toBe('out')
    expect(stockState(5, 5)).toBe('low')
    expect(stockState(6, 5)).toBe('ok')
    expect(stockState(2, null)).toBe('ok')
    expect(stockState(2, 0)).toBe('ok')
  })
  it('filters', () => {
    expect(matchesStockFilter('out', 'low')).toBe(true)
    expect(matchesStockFilter('low', 'out')).toBe(false)
    expect(matchesStockFilter('negative', 'negative')).toBe(true)
    expect(matchesStockFilter('ok', 'all')).toBe(true)
    expect(matchesStockFilter('ok', 'low')).toBe(false)
  })
})

describe('negativeStockGuard', () => {
  it('flags only those that would go below zero', () => {
    const current = new Map([
      ['item:a', 10],
      ['item:b', 2],
    ])
    const taking = new Map([
      ['item:a', 10],
      ['item:b', 3],
    ])

    expect(negativeStockGuard(current, taking)).toEqual([{ key: 'item:b', onHand: 2, after: -1 }])
  })
  it('treats a thing with no stock as zero', () => {
    expect(negativeStockGuard(new Map(), new Map([['material:m', 1]]))).toHaveLength(1)
  })
  it('allows taking exactly what is there', () => {
    expect(negativeStockGuard(new Map([['item:a', 4]]), new Map([['item:a', 4]]))).toEqual([])
  })
})

describe('remainingToReceive', () => {
  it('is what is left', () => {
    expect(remainingToReceive(10, 4)).toBe(6)
    expect(remainingToReceive(10, 10)).toBe(0)
  })
  it('never goes below zero', () => {
    expect(remainingToReceive(10, 12)).toBe(0)
  })
  it('is capped by the other document', () => {
    expect(remainingToReceive(10, 0, 3)).toBe(3)
    expect(remainingToReceive(10, 8, 5)).toBe(2)
    expect(remainingToReceive(10, 0, -1)).toBe(0)
  })
})

describe('derivePoStatus', () => {
  it('moves sent to partial to received', () => {
    expect(derivePoStatus('SENT', [{ qty: 5, receivedQty: 0 }])).toBe('SENT')
    expect(
      derivePoStatus('SENT', [
        { qty: 5, receivedQty: 5 },
        { qty: 2, receivedQty: 0 },
      ]),
    ).toBe('PARTIAL')
    expect(derivePoStatus('PARTIAL', [{ qty: 5, receivedQty: 5 }])).toBe('RECEIVED')
  })
  it('goes back when a receipt is reversed', () => {
    expect(derivePoStatus('RECEIVED', [{ qty: 5, receivedQty: 0 }])).toBe('SENT')
    expect(derivePoStatus('RECEIVED', [{ qty: 5, receivedQty: 2 }])).toBe('PARTIAL')
  })
  it('never moves drafts or cancelled orders', () => {
    expect(derivePoStatus('DRAFT', [{ qty: 5, receivedQty: 5 }])).toBe('DRAFT')
    expect(derivePoStatus('CANCELLED', [{ qty: 5, receivedQty: 5 }])).toBe('CANCELLED')
  })
  it('keeps the status when there is nothing receivable', () => {
    expect(derivePoStatus('SENT', [])).toBe('SENT')
  })
})

describe('reversalMovements and totals', () => {
  const receipt = [
    { itemId: 'a', materialId: null, qty: 5, unitCost: 10 },
    { itemId: null, materialId: 'm', qty: 2.5, unitCost: 4 },
  ]
  it('flips sign, keeps cost, becomes a return', () => {
    expect(reversalMovements(receipt)).toEqual([
      { itemId: 'a', materialId: null, type: 'PURCHASE_RETURN', qty: -5, unitCost: 10 },
      { itemId: null, materialId: 'm', type: 'PURCHASE_RETURN', qty: -2.5, unitCost: 4 },
    ])
  })
  it('nets to zero with the original', () => {
    const all = [...receipt, ...reversalMovements(receipt)]
    expect(onHand(all)).toBe(0)
  })
  it('totals by key', () => {
    const totals = totalsByKey([...receipt, { itemId: 'a', materialId: null, qty: 1 }])
    expect(totals.get('item:a')).toBe(6)
    expect(totals.get('material:m')).toBe(2.5)
    expect(stockKey({ itemId: 'a', materialId: null })).toBe('item:a')
  })
})

describe('runningBalance', () => {
  it('carries the balance forward', () => {
    expect(runningBalance([{ qty: 10 }, { qty: -4 }, { qty: 1.5 }]).map((m) => m.balance)).toEqual([
      10, 6, 7.5,
    ])
  })
})

describe('unitCostFromTaxable', () => {
  it('divides taxable by quantity', () => {
    expect(unitCostFromTaxable(1000, 8)).toBe(125)
    expect(unitCostFromTaxable(100, 3)).toBe(33.3333)
    expect(unitCostFromTaxable(100, 0)).toBe(0)
  })
})
