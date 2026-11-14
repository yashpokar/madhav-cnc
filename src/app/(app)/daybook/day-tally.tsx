'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'
import { LocalTime } from '@/components/local-time'
import { closeDay, reopenDay, setTallyBank, setTallyCount } from '@/lib/actions/tally'
import type { DaybookLayout } from '@/lib/daybook-layout'

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const input =
  'w-full rounded-md bg-transparent px-2.5 py-1.5 text-right text-sm/6 tabular-nums outline-none ring-1 ring-transparent hover:ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:hover:ring-white/15 dark:focus:bg-zinc-900'

type Expectation = { expected: number | null; since: string | null }

type Close = {
  closedByName: string | null
  closedAt: string
  cashCounted: number
  cashExpected: number | null
  bankCounted: number
  bankExpected: number | null
} | null

const round = (value: number) => Math.round(value * 100) / 100

/** One line of the end-of-day check: what it should be, what was counted, and whether they agree. */
function Check({
  title,
  counted,
  expectation,
}: {
  title: string
  counted: number
  expectation: Expectation
}) {
  const { expected, since } = expectation
  const difference = expected === null ? null : round(counted - expected)
  const ok = difference === 0

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      <h4 className="bg-zinc-50 px-4 py-2 text-sm/6 font-semibold dark:bg-white/5">{title}</h4>
      <dl className="divide-y divide-zinc-950/5 text-sm/6 dark:divide-white/10">
        <div className="flex items-center justify-between px-4 py-2">
          <dt className="text-zinc-600 dark:text-zinc-300">
            {expected === null
              ? 'Should be'
              : `Should be (last count${since ? ` ${since}` : ''} + movement since)`}
          </dt>
          <dd className="font-semibold tabular-nums">
            {expected === null ? '—' : money.format(expected)}
          </dd>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <dt className="text-zinc-600 dark:text-zinc-300">Counted today</dt>
          <dd className="font-semibold tabular-nums">{money.format(counted)}</dd>
        </div>
        <div
          className={`flex items-center justify-between px-4 py-2.5 ${
            difference === null
              ? 'text-zinc-600 dark:text-zinc-300'
              : ok
                ? 'bg-lime-50 text-lime-800 dark:bg-lime-400/10 dark:text-lime-300'
                : 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-300'
          }`}
        >
          <dt className="font-medium">
            {difference === null
              ? 'Nothing earlier to compare with. Today becomes the starting count.'
              : ok
                ? 'Matches'
                : difference > 0
                  ? 'More than it should be'
                  : 'Less than it should be'}
          </dt>
          {difference !== null ? (
            <dd className="font-bold tabular-nums">{money.format(Math.abs(difference))}</dd>
          ) : null}
        </div>
      </dl>
    </div>
  )
}

/**
 * The counting area under the day's book: how many notes of each kind are in
 * the drawer, and what each bank shows. It saves as you move between cells,
 * checks cash and bank separately against the book, and ends with a sign-off.
 */
export function DayTally({
  date,
  denominations,
  banks,
  counts,
  balances,
  cash,
  bank,
  close,
  canEdit,
  layout,
}: {
  date: string
  denominations: { id: string; value: number }[]
  banks: { id: string; name: string }[]
  counts: Record<number, number>
  balances: Record<string, number>
  cash: Expectation
  bank: Expectation
  close: Close
  canEdit: boolean
  layout: DaybookLayout['tally']
}) {
  const router = useRouter()
  const [noteCounts, setNoteCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      denominations.map((d) => [d.value, counts[d.value] ? String(counts[d.value]) : '']),
    ),
  )
  const [bankBalances, setBankBalances] = useState<Record<string, string>>(() =>
    Object.fromEntries(banks.map((b) => [b.id, balances[b.id] ? String(balances[b.id]) : ''])),
  )
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const locked = close !== null
  const editable = canEdit && !locked

  const cashCounted = denominations.reduce(
    (sum, d) => sum + d.value * (Number(noteCounts[d.value]) || 0),
    0,
  )
  const bankCounted = banks.reduce((sum, b) => sum + (Number(bankBalances[b.id]) || 0), 0)

  const cashDiff = cash.expected === null ? null : round(cashCounted - cash.expected)
  const bankDiff = bank.expected === null ? null : round(bankCounted - bank.expected)
  const mismatch = (cashDiff !== null && cashDiff !== 0) || (bankDiff !== null && bankDiff !== 0)

  function save(run: () => ReturnType<typeof setTallyCount>) {
    setStatus('Saving…')
    startTransition(async () => {
      const result = await run()
      setStatus(result.ok ? 'Saved' : result.error)
    })
  }

  function confirm() {
    startTransition(async () => {
      const result = await closeDay(date)
      setStatus(result.ok ? result.message : result.error)
      if (result.ok) router.refresh()
    })
  }

  const bankRows = banks.map((b) => (
        <tr key={`bank-${b.id}`}>
          <th scope="row" className="py-1 pr-3 text-left font-medium">
            {b.name}
          </th>
          <td className="px-2 text-right text-zinc-300">—</td>
          <td className="py-1 pl-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={bankBalances[b.id] ?? ''}
              disabled={!editable}
              aria-label={`${b.name} balance`}
              placeholder="0.00"
              className={input}
              onChange={(event) =>
                setBankBalances((current) => ({ ...current, [b.id]: event.target.value }))
              }
              onBlur={() => save(() => setTallyBank(date, b.id, Number(bankBalances[b.id]) || 0))}
            />
          </td>
        </tr>
      ))

  const noteRows = denominations.map((d) => {
        const count = Number(noteCounts[d.value]) || 0

        return (
          <tr key={`note-${d.id}`}>
            <th scope="row" className="py-1 pr-3 text-left font-medium tabular-nums">
              ₹{d.value} <span className="font-normal text-zinc-400">×</span>
            </th>
              <td className="px-2 py-1">
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={0}
                  value={noteCounts[d.value] ?? ''}
                  disabled={!editable}
                  aria-label={`Number of ₹${d.value} notes`}
                  placeholder="0"
                  className={input}
                  onChange={(event) =>
                    setNoteCounts((current) => ({ ...current, [d.value]: event.target.value }))
                  }
                  onBlur={() => save(() => setTallyCount(date, d.value, count))}
                />
              </td>
            <td className="py-1 pl-2 text-right text-zinc-600 tabular-nums dark:text-zinc-300">
              {count ? money.format(count * d.value) : ''}
            </td>
          </tr>
        )
      })

  return (
    <div className="grid grid-cols-1 gap-8 border-t border-zinc-950/5 p-5 lg:grid-cols-2 dark:border-white/10">
      <div className="min-w-0 overflow-x-auto">
        <h3 className="mb-3 text-sm/6 font-semibold tracking-wide uppercase">
          Banks and cash counted
        </h3>
        <table className="w-full min-w-[20rem] border-collapse text-sm/6">
          <thead>
            <tr className="border-b border-zinc-950/10 text-xs/5 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <th className="pb-2 text-left font-medium">Mode</th>
              <th className="w-28 pb-2 text-right font-medium">Count</th>
              <th className="w-44 pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
            {layout.order === 'banks-first' ? bankRows : noteRows}
            {layout.order === 'banks-first' ? noteRows : bankRows}
          </tbody>
          <tfoot>
              <tr className="border-t border-zinc-950/10 font-semibold dark:border-white/10">
                <td className="pt-3 text-left" colSpan={2}>
                  Grand total
                </td>
                <td className="pt-3 text-right tabular-nums">
                  {money.format(
                    bankCounted + cashCounted,
                  )}
                </td>
              </tr>
            </tfoot>
        </table>
      </div>

      <div className="grid content-start gap-4">
        <h3 className="text-center text-sm/6 font-bold tracking-wide uppercase">
          End of day check
        </h3>

        <Check title="Cash" counted={cashCounted} expectation={cash} />
        <Check title="Bank" counted={bankCounted} expectation={bank} />

        {close ? (
          <div className="grid gap-2 rounded-lg bg-lime-50 p-4 text-sm/6 text-lime-900 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:text-lime-200 dark:ring-lime-400/20">
            <p className="font-semibold">
              Day confirmed{close.closedByName ? ` by ${close.closedByName}` : ''} ·{' '}
              <LocalTime value={close.closedAt} withZone />
            </p>
            <p className="tabular-nums">
              Cash {money.format(close.cashCounted)} · Bank {money.format(close.bankCounted)}
              {close.cashExpected !== null && round(close.cashCounted - close.cashExpected) !== 0
                ? ` · cash was ${money.format(Math.abs(close.cashCounted - close.cashExpected))} ${close.cashCounted > close.cashExpected ? 'over' : 'short'}`
                : ''}
              {close.bankExpected !== null && round(close.bankCounted - close.bankExpected) !== 0
                ? ` · bank was ${money.format(Math.abs(close.bankCounted - close.bankExpected))} ${close.bankCounted > close.bankExpected ? 'over' : 'short'}`
                : ''}
            </p>
            {canEdit ? (
              <div>
                <ConfirmButton
                  tone="neutral"
                  label="Reopen day"
                  title="Reopen this day?"
                  description="The confirmation is removed and the counts can be edited again."
                  confirmLabel="Reopen"
                  action={() => reopenDay(date)}
                />
              </div>
            ) : null}
          </div>
        ) : canEdit ? (
          <div className="grid gap-2">
            {mismatch ? (
              <p
                role="alert"
                className="rounded-lg bg-amber-50 px-4 py-2 text-sm/6 text-amber-900 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20"
              >
                {cashDiff !== null && cashDiff !== 0 ? 'Cash' : 'Bank'} does not match the book.
                Recount before confirming, or confirm anyway and the difference is recorded.
              </p>
            ) : null}
            {mismatch ? (
              <ConfirmButton
                label="Confirm anyway"
                title="Confirm the day with a difference?"
                description="The counts and the difference are recorded against today, with your name."
                confirmLabel="Confirm anyway"
                action={() => closeDay(date)}
              />
            ) : (
              <Button disabled={pending} onClick={confirm}>
                Confirm cash and bank for the day
              </Button>
            )}
          </div>
        ) : null}

        <p className="text-xs/5 text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
          {pending ? 'Saving…' : (status ?? 'Counts save as you move between cells.')}
        </p>
      </div>
    </div>
  )
}
