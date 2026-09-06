'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { FormBanner } from '@/components/form-banner'
import { deleteReceipt, updateAllocations } from '@/lib/actions/payments'
import type { SimpleResult } from '@/lib/actions/payments'
import type { OpenInvoice } from '@/lib/queries/payments'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function ApplyPanel({
  paymentId,
  receiptAmount,
  invoices,
  current,
  canUpdate,
  canDelete,
}: {
  paymentId: string
  receiptAmount: number
  invoices: OpenInvoice[]
  current: Record<string, number>
  canUpdate: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [applied, setApplied] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, String(value)]),
    ),
  )

  const allocated = round2(
    invoices.reduce((sum, invoice) => sum + num(applied[invoice.id] ?? ''), 0),
  )
  const unallocated = round2(receiptAmount - allocated)
  const overApplied = allocated > receiptAmount + 0.005

  function autoAllocate() {
    let left = receiptAmount
    const next: Record<string, string> = {}

    for (const invoice of invoices) {
      if (left <= 0) break

      const take = round2(Math.min(left, invoice.due))
      next[invoice.id] = String(take)
      left = round2(left - take)
    }

    setApplied(next)
  }

  function save() {
    startTransition(async () => {
      const outcome = await updateAllocations(
        paymentId,
        invoices.map((invoice) => ({
          invoiceId: invoice.id,
          amount: num(applied[invoice.id] ?? ''),
        })),
      )

      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      {canUpdate && invoices.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Button outline type="button" onClick={autoAllocate}>
              Apply oldest first
            </Button>
            <Button outline type="button" onClick={() => setApplied({})}>
              Clear
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm/6">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Invoice</th>
                  <th className="pb-2 pr-3 font-medium">Due date</th>
                  <th className="w-36 pb-2 pr-3 text-right font-medium">
                    Outstanding
                  </th>
                  <th className="w-36 pb-2 text-right font-medium">Apply</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="align-top">
                    <td className="py-2 pr-3 pt-4 font-mono text-xs">
                      {invoice.number}
                    </td>
                    <td className="py-2 pr-3 pt-4 text-zinc-500 dark:text-zinc-400">
                      {invoice.dueDate
                        ? dateFormat.format(invoice.dueDate)
                        : dateFormat.format(invoice.invoiceDate)}
                    </td>
                    <td className="py-2 pr-3 pt-4 text-right font-medium tabular-nums">
                      {currency.format(invoice.due)}
                    </td>
                    <td className="py-2">
                      <Input
                        aria-label={`Amount applied to ${invoice.number}`}
                        type="number"
                        step="0.01"
                        min={0}
                        value={applied[invoice.id] ?? ''}
                        onChange={(event) =>
                          setApplied({
                            ...applied,
                            [invoice.id]: event.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={pending || overApplied} onClick={save}>
              {pending ? 'Saving…' : 'Save allocation'}
            </Button>
            <span
              className={
                overApplied
                  ? 'text-sm/6 font-medium text-red-600 dark:text-red-400'
                  : 'text-sm/6 text-zinc-500 dark:text-zinc-400'
              }
            >
              {overApplied
                ? 'Applied more than this receipt holds'
                : `${currency.format(unallocated)} would stay on account`}
            </span>
          </div>
        </>
      ) : null}

      {canUpdate && invoices.length === 0 ? (
        <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
          This customer has no other open invoices right now.
        </p>
      ) : null}

      {canDelete ? (
        <div>
          <Button
            plain
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await deleteReceipt(paymentId)

                if (outcome.ok) {
                  router.push('/payments')
                } else {
                  setResult(outcome)
                }
              })
            }
          >
            Delete receipt
          </Button>
        </div>
      ) : null}
    </div>
  )
}
