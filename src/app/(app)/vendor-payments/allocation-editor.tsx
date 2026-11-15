'use client'

import { date as dateFormat, money as currency } from '@/lib/format'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { allocateOldestFirst, round2 } from '@/lib/payables-math'
import type { OpenBill } from '@/lib/queries/vendor-payments'

export const num = (value: string) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

/** Totals for a split, shared by the new-payment form and the edit panel. */
export function summarise(
  bills: OpenBill[],
  applied: Record<string, string>,
  opening: string,
  openingLeft: number,
  amount: number,
) {
  const openingAmount = openingLeft > 0 ? num(opening) : 0
  const billTotal = round2(
    bills.reduce((sum, bill) => sum + num(applied[bill.id] ?? ''), 0),
  )
  const allocated = round2(billTotal + openingAmount)
  const rowTooMuch = bills.some((bill) => num(applied[bill.id] ?? '') > bill.due + 0.005)
  const openingTooMuch = openingAmount > openingLeft + 0.005

  return {
    openingAmount,
    allocated,
    unapplied: round2(amount - allocated),
    overApplied: allocated > amount + 0.005 || openingTooMuch || rowTooMuch,
    openingTooMuch,
  }
}

export function oldestFirst(bills: OpenBill[], amount: number) {
  const amounts = allocateOldestFirst(
    amount,
    bills.map((bill) => bill.due),
  )
  const next: Record<string, string> = {}

  bills.forEach((bill, index) => {
    if (amounts[index] > 0) next[bill.id] = String(amounts[index])
  })

  return next
}

/**
 * The allocation table: one row per open bill of the vendor plus an "apply to
 * opening payable" line. Whatever is not applied stays as an advance to the
 * vendor.
 */
export function AllocationEditor({
  bills,
  openingLeft,
  openingAsOf,
  amount,
  applied,
  onApplied,
  opening,
  onOpening,
}: {
  bills: OpenBill[]
  openingLeft: number
  openingAsOf: Date | null
  amount: number
  applied: Record<string, string>
  onApplied: (next: Record<string, string>) => void
  opening: string
  onOpening: (next: string) => void
}) {
  const openingTooMuch = num(opening) > openingLeft + 0.005

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap gap-3">
        <Button
          outline
          type="button"
          disabled={amount <= 0}
          onClick={() => {
            onApplied(oldestFirst(bills, amount))
            onOpening('')
          }}
        >
          Apply oldest first
        </Button>
        <Button
          outline
          type="button"
          onClick={() => {
            onApplied({})
            onOpening('')
          }}
        >
          Clear
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[44rem] text-left text-sm/6">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="pb-2 pr-3 font-medium">Bill</th>
              <th className="pb-2 pr-3 font-medium">Due date</th>
              <th className="w-32 pb-2 pr-3 text-right font-medium">Total</th>
              <th className="w-32 pb-2 pr-3 text-right font-medium">Outstanding</th>
              <th className="w-36 pb-2 text-right font-medium">Apply</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="align-top">
                <td data-label="Bill" className="py-2 pr-3 pt-4 font-mono text-xs">
                  {bill.number}
                  {bill.vendorBillNumber ? (
                    <div className="font-sans text-zinc-500 dark:text-zinc-400">
                      {bill.vendorBillNumber}
                    </div>
                  ) : null}
                </td>
                <td data-label="Due date" data-half className="py-2 pr-3 pt-4 text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(bill.dueDate ?? bill.billDate)}
                </td>
                <td data-label="Total" data-half className="py-2 pr-3 pt-4 text-right tabular-nums">
                  {currency.format(bill.total)}
                </td>
                <td data-label="Outstanding" data-half className="py-2 pr-3 pt-4 text-right font-medium tabular-nums">
                  {currency.format(bill.due)}
                </td>
                <td data-label="Apply" className="py-2">
                  <Input
                    aria-label={`Amount applied to ${bill.number}`}
                    type="number"
                    step="0.01"
                    min={0}
                    max={bill.due}
                    value={applied[bill.id] ?? ''}
                    onChange={(event) => onApplied({ ...applied, [bill.id]: event.target.value })}
                  />
                </td>
              </tr>
            ))}
            {openingLeft > 0 ? (
              <tr className="align-top">
                <td data-label="Bill" className="py-2 pr-3 pt-4 font-medium">
                  Apply to opening payable
                </td>
                <td data-label="Due date" data-half className="py-2 pr-3 pt-4 text-zinc-500 dark:text-zinc-400">
                  {openingAsOf ? `as of ${dateFormat.format(openingAsOf)}` : '—'}
                </td>
                <td data-label="Total" data-half className="py-2 pr-3 pt-4 text-right tabular-nums">
                  —
                </td>
                <td data-label="Outstanding" data-half className="py-2 pr-3 pt-4 text-right font-medium tabular-nums">
                  {currency.format(openingLeft)}
                </td>
                <td data-label="Apply" className="py-2">
                  <Input
                    aria-label="Amount applied to the opening payable"
                    type="number"
                    step="0.01"
                    min={0}
                    max={openingLeft}
                    value={opening}
                    invalid={openingTooMuch}
                    onChange={(event) => onOpening(event.target.value)}
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
