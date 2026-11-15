'use client'

import { money as currency } from '@/lib/format'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import { deleteVendorPayment, updateVendorAllocations } from '@/lib/actions/vendor-payments'
import type { SimpleResult } from '@/lib/actions/vendor-payments'
import type { OpenBill } from '@/lib/queries/vendor-payments'
import { round2 } from '@/lib/payables-math'
import { AllocationEditor, num, summarise } from '../allocation-editor'

export function ApplyPanel({
  paymentId,
  amount,
  bills,
  current,
  openingLeft,
  openingAsOf,
  openingApplied: initialOpening,
  canUpdate,
  canDelete,
}: {
  paymentId: string
  amount: number
  /** Open bills of the vendor, leaving this payment's own allocations out. */
  bills: OpenBill[]
  current: Record<string, number>
  /** What is left of the opening payable, not counting this payment's own part. */
  openingLeft: number
  openingAsOf: Date | null
  openingApplied: number
  canUpdate: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [opening, setOpening] = useState(initialOpening > 0 ? String(initialOpening) : '')
  const [applied, setApplied] = useState<Record<string, string>>(() => {
    const existing = Object.entries(current)

    // A single open bill and nothing applied yet: offer the obvious answer
    // (unless there is also an opening payable, which needs a choice).
    if (existing.length === 0 && initialOpening <= 0 && openingLeft <= 0 && bills.length === 1) {
      const take = round2(Math.min(amount, bills[0].due))

      return take > 0 ? { [bills[0].id]: String(take) } : {}
    }

    return Object.fromEntries(existing.map(([key, value]) => [key, String(value)]))
  })

  const { openingAmount, unapplied, overApplied } = summarise(
    bills,
    applied,
    opening,
    openingLeft,
    amount,
  )

  function save() {
    startTransition(async () => {
      const outcome = await updateVendorAllocations(
        paymentId,
        bills.map((bill) => ({ billId: bill.id, amount: num(applied[bill.id] ?? '') })),
        openingAmount,
      )

      setResult(outcome)

      if (outcome.ok) router.refresh()
    })
  }

  const hasTargets = bills.length > 0 || openingLeft > 0

  return (
    <div className="grid grid-cols-1 gap-6 print:hidden">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      {canUpdate && hasTargets ? (
        <>
          <AllocationEditor
            bills={bills}
            openingLeft={openingLeft}
            openingAsOf={openingAsOf}
            amount={amount}
            applied={applied}
            onApplied={setApplied}
            opening={opening}
            onOpening={setOpening}
          />

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
                ? 'Applied more than this payment holds, or more than a bill has outstanding'
                : `${currency.format(unapplied)} would stay as an advance to the vendor`}
            </span>
          </div>
        </>
      ) : null}

      {canUpdate && !hasTargets ? (
        <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
          This vendor has no other open bills right now.
        </p>
      ) : null}

      {canDelete ? (
        <div>
          <ConfirmButton
            outline={false}
            label="Delete payment"
            title="Delete this payment?"
            description="Any amounts applied to bills will be released and those bills will show as unpaid again. This cannot be undone."
            redirectTo="/vendor-payments"
            disabled={pending}
            action={() => deleteVendorPayment(paymentId)}
          />
        </div>
      ) : null}
    </div>
  )
}
