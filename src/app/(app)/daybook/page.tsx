import type { Metadata } from 'next'
import { TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import { PrintButton } from '@/components/print-button'
import { deleteCashCredit, deleteExpense } from '@/lib/actions/expenses'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { listCashCreditSources, listExpenseVendors } from '@/lib/queries/accounting'
import {
  getDayClose,
  getDayTally,
  listBankAccounts,
  listDenominations,
  reconcile,
} from '@/lib/queries/daybook'
import { requireCapability } from '@/lib/session'
import type { PaymentMode } from '@/generated/prisma/enums'
import { CheckCell } from './check-cell'
import { DayTally } from './day-tally'
import { EntryRow } from './entry-row'

export const metadata: Metadata = {
  title: 'Day book',
}

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const longDay = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthName = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const iso = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)

/** A line in the book. Receipts and credit notes come from other places. */
type Line = {
  id: string
  kind: 'expense' | 'credit' | 'receipt' | 'note'
  name: string
  mode: PaymentMode | null
  amount: number
  note: string | null
  href?: string
  /** Set for lines that can be deleted from here. */
  deleteId?: string
  checked?: boolean
}

const MIN_ROWS = 15

function parseRange(params: Record<string, string | string[] | undefined>) {
  const pick = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined
  const view = pick('view') === 'month' ? 'month' : 'day'
  const today = new Date(`${iso(new Date())}T00:00:00Z`)
  const dateText = pick('date')
  const parsed =
    dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00Z`) : today
  const anchor = Number.isNaN(parsed.getTime()) ? today : parsed

  if (view === 'month') {
    const y = anchor.getUTCFullYear()
    const m = anchor.getUTCMonth()

    return {
      view,
      anchor,
      from: new Date(Date.UTC(y, m, 1)),
      to: new Date(Date.UTC(y, m + 1, 0)),
      prev: iso(new Date(Date.UTC(y, m - 1, 1))),
      next: iso(new Date(Date.UTC(y, m + 1, 1))),
      label: monthName.format(anchor),
    }
  }

  return {
    view,
    anchor,
    from: anchor,
    to: anchor,
    prev: iso(addDays(anchor, -1)),
    next: iso(addDays(anchor, 1)),
    label: longDay.format(anchor),
  }
}

function Ledger({
  title,
  caption,
  tone,
  lines,
  total,
  canDelete,
  canCheck,
  entry,
}: {
  title: string
  caption: string
  tone: 'credit' | 'debit'
  lines: Line[]
  total: number
  canDelete: boolean
  canCheck: boolean
  /** The typed-in row at the bottom; omitted when the book is read-only. */
  entry?: React.ReactNode
}) {
  const accent =
    tone === 'credit' ? 'text-lime-700 dark:text-lime-400' : 'text-red-600 dark:text-red-400'
  const grid = 'border border-zinc-400 dark:border-white/30'
  const blanks = Math.max(0, MIN_ROWS - lines.length - (entry ? 1 : 0))
  const tick = (line: Line) =>
    line.kind === 'note' ? null : (
      <CheckCell
        kind={line.kind}
        id={line.deleteId ?? line.id.replace(/^[a-z]+-/, '')}
        checked={Boolean(line.checked)}
        disabled={!canCheck}
        label={line.name}
      />
    )

  return (
    <div className="min-w-0 overflow-x-auto p-3">
      <table className="w-full min-w-[26rem] border-collapse text-sm/6">
        <caption className="pb-2 text-center">
          <span className={`block text-sm/6 font-bold tracking-wide uppercase ${accent}`}>
            {title}
          </span>
          <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">{caption}</span>
        </caption>
        <thead>
          <tr className="text-left text-sm/6 font-medium">
            <th className={`${grid} w-16 px-2 py-1 text-center`}>Check</th>
            <th className={`${grid} w-32 px-2 py-1 text-right`}>Amount</th>
            <th className={`${grid} px-2 py-1`}>Description</th>
            <th className={`${grid} w-32 px-2 py-1`}>Payment mode</th>
            <th className="w-8 print:hidden">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const reference = line.kind === 'note'
            const name = (
              <>
                <span className="font-medium">{line.name}</span>
                {line.note ? (
                  <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {line.note}
                  </span>
                ) : null}
              </>
            )

            return (
              <tr
                key={line.id}
                className={reference ? 'bg-zinc-50 text-zinc-500 italic dark:bg-white/[0.02]' : ''}
              >
                <td className={`${grid} px-2 text-center`}>{tick(line)}</td>
                <td
                  className={`${grid} px-2 text-right tabular-nums ${reference ? '' : `font-medium ${accent}`}`}
                >
                  {money.format(line.amount)}
                </td>
                <td className={`${grid} px-2 py-1`}>
                  {line.href ? (
                    <Link href={line.href} className="block hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </td>
                <td className={`${grid} px-2 text-zinc-600 dark:text-zinc-300`}>
                  {reference ? 'Credit note' : line.mode ? PAYMENT_MODE_LABELS[line.mode] : ''}
                </td>
                <td className="px-1 text-center print:hidden">
                  {line.deleteId && canDelete ? (
                    <ConfirmButton
                      outline={false}
                      label={`Delete ${line.name}`}
                      title={`Delete this entry for ${line.name}?`}
                      description="This removes the entry and changes the day book balance."
                      confirmLabel="Delete"
                      action={
                        line.kind === 'expense'
                          ? deleteExpense.bind(null, line.deleteId)
                          : deleteCashCredit.bind(null, line.deleteId)
                      }
                    >
                      <TrashIcon className="size-4" aria-hidden="true" />
                      <span className="sr-only">Delete</span>
                    </ConfirmButton>
                  ) : null}
                </td>
              </tr>
            )
          })}
          {entry}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td className={`${grid} py-2.5`} />
              <td className={grid} />
              <td className={grid} />
              <td className={grid} />
              <td className="print:hidden" />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm/6 font-semibold">
        <span>Total amount</span>
        <span
          className={`min-w-36 border border-zinc-400 px-2 py-1 text-right tabular-nums dark:border-white/30 ${accent}`}
        >
          {money.format(total)}
        </span>
      </div>
    </div>
  )
}

export default async function DayBookPage({ searchParams }: PageProps<'/daybook'>) {
  const user = await requireCapability('expense:read')
  const params = await searchParams
  const range = parseRange(params)
  const cashOnly = params.mode === 'cash'
  const canSeeReceipts = can(user.role, 'payment:read')
  const canCreate = can(user.role, 'expense:create')
  const canDelete = can(user.role, 'expense:delete')
  const canCheck = can(user.role, 'expense:update')
  const canSeeNotes = can(user.role, 'note:read')
  const saved = typeof params.saved === 'string' ? params.saved : undefined
  const savedCredit = params.savedCredit === '1'
  const modeFilter = cashOnly ? { equals: 'CASH' as const } : undefined
  const inRange = { gte: range.from, lte: range.to }

  const [
    expenses,
    receipts,
    credits,
    notes,
    priorExpenses,
    priorReceipts,
    priorCredits,
    vendors,
    sources,
  ] = await Promise.all([
    prisma.expense.findMany({
      where: { expenseDate: inRange, ...(modeFilter ? { paymentMode: modeFilter } : {}) },
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        expenseDate: true,
        payeeName: true,
        description: true,
        paymentMode: true,
        total: true,
        isChecked: true,
      },
    }),
    canSeeReceipts
      ? prisma.payment.findMany({
          where: { paidOn: inRange, ...(modeFilter ? { mode: modeFilter } : {}) },
          orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            paidOn: true,
            mode: true,
            amount: true,
            reference: true,
            isChecked: true,
            customer: { select: { name: true } },
          },
        })
      : [],
    prisma.cashCredit.findMany({
      where: { entryDate: inRange, ...(modeFilter ? { mode: modeFilter } : {}) },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        entryDate: true,
        sourceName: true,
        notes: true,
        mode: true,
        amount: true,
        isChecked: true,
      },
    }),
    // Credit notes move no cash, so they are listed for reference only and are
    // left out when the book is limited to cash.
    canSeeNotes && !cashOnly
      ? prisma.creditDebitNote.findMany({
          where: { kind: 'CREDIT', status: 'ISSUED', noteDate: inRange },
          orderBy: [{ noteDate: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            number: true,
            noteDate: true,
            total: true,
            vendorName: true,
            customer: { select: { name: true } },
          },
        })
      : [],
    prisma.expense.aggregate({
      where: {
        expenseDate: { lt: range.from },
        ...(modeFilter ? { paymentMode: modeFilter } : {}),
      },
      _sum: { total: true },
    }),
    canSeeReceipts
      ? prisma.payment.aggregate({
          where: { paidOn: { lt: range.from }, ...(modeFilter ? { mode: modeFilter } : {}) },
          _sum: { amount: true },
        })
      : null,
    prisma.cashCredit.aggregate({
      where: { entryDate: { lt: range.from }, ...(modeFilter ? { mode: modeFilter } : {}) },
      _sum: { amount: true },
    }),
    canCreate ? listExpenseVendors() : [],
    canCreate ? listCashCreditSources() : [],
  ])

  const opening =
    (priorReceipts?._sum.amount?.toNumber() ?? 0) +
    (priorCredits._sum.amount?.toNumber() ?? 0) -
    (priorExpenses._sum.total?.toNumber() ?? 0)

  // Group by day so a month reads as a sequence of daily pages.
  const days = new Map<string, { received: Line[]; spent: Line[] }>()
  const dayOf = (key: string) => {
    const existing = days.get(key) ?? { received: [], spent: [] }
    days.set(key, existing)
    return existing
  }

  for (const p of receipts) {
    dayOf(iso(p.paidOn)).received.push({
      id: `receipt-${p.id}`,
      kind: 'receipt',
      name: p.customer.name,
      mode: p.mode,
      amount: p.amount.toNumber(),
      note: p.reference ? `Customer receipt · ${p.reference}` : 'Customer receipt',
      href: `/payments/${p.id}`,
      checked: p.isChecked,
    })
  }
  for (const c of credits) {
    dayOf(iso(c.entryDate)).received.push({
      id: `credit-${c.id}`,
      kind: 'credit',
      name: c.sourceName,
      mode: c.mode,
      amount: c.amount.toNumber(),
      note: c.notes,
      deleteId: c.id,
      checked: c.isChecked,
    })
  }
  for (const n of notes) {
    dayOf(iso(n.noteDate)).received.push({
      id: `note-${n.id}`,
      kind: 'note',
      name: n.customer?.name ?? n.vendorName ?? n.number,
      mode: null,
      amount: n.total.toNumber(),
      note: `${n.number} · not a cash movement`,
      href: `/notes/${n.id}`,
    })
  }
  for (const e of expenses) {
    dayOf(iso(e.expenseDate)).spent.push({
      id: `expense-${e.id}`,
      kind: 'expense',
      name: e.payeeName,
      mode: e.paymentMode,
      amount: e.total.toNumber(),
      note: e.description,
      href: `/expenses/${e.id}`,
      deleteId: e.id,
      checked: e.isChecked,
    })
  }

  // A single day always shows its page, even when empty, so it can be typed into.
  if (range.view === 'day') dayOf(iso(range.anchor))

  const sum = (lines: Line[]) =>
    lines.filter((l) => l.kind !== 'note').reduce((t, l) => t + l.amount, 0)

  const pages = [...days.keys()].sort().reduce<
    {
      key: string
      received: Line[]
      spent: Line[]
      receivedTotal: number
      spentTotal: number
      start: number
      end: number
    }[]
  >((acc, key) => {
    const day = days.get(key)!
    const start = acc.length ? acc[acc.length - 1].end : opening
    const receivedTotal = sum(day.received)
    const spentTotal = sum(day.spent)

    return [
      ...acc,
      {
        key,
        received: day.received,
        spent: day.spent,
        receivedTotal,
        spentTotal,
        start,
        end: start + receivedTotal - spentTotal,
      },
    ]
  }, [])

  const totalReceived = pages.reduce((t, p) => t + p.receivedTotal, 0)
  const totalSpent = pages.reduce((t, p) => t + p.spentTotal, 0)
  const net = totalReceived - totalSpent
  const closing = opening + net

  // The counting area belongs to one day, so it only exists in the day view.
  const tallyDay = range.view === 'day'
  const [tally, tallyBanks, tallyNotes, check, dayClose] = tallyDay
    ? await Promise.all([
        getDayTally(range.anchor),
        listBankAccounts(true),
        listDenominations(true),
        reconcile(range.anchor),
        getDayClose(range.anchor),
      ])
    : [null, [], [], null, null]

  const link = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams({
      view: range.view,
      date: iso(range.anchor),
      ...(cashOnly ? { mode: 'cash' } : {}),
    })
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) query.delete(k)
      else query.set(k, v)
    }
    return `/daybook?${query}`
  }
  const pill = (active: boolean) =>
    active
      ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
      : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
  const editable = canCreate && range.view === 'day'

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Day book</Heading>
          <Text>
            Every day&apos;s money received and money spent, page by page.
            {editable
              ? ' Type straight into the last row of a side and press Enter to add it.'
              : ''}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton label="Print" />
          <Button outline href="/expenses">
            All expenses
          </Button>
          {canCheck ? (
            <Button outline href="/daybook/setup">
              Banks &amp; notes
            </Button>
          ) : null}
          {canCreate ? (
            <Button outline href="/daybook/credit/new">
              Add money received
            </Button>
          ) : null}
          {canCreate ? <Button href="/expenses/lite/new">Add expense</Button> : null}
        </div>
      </div>

      {saved ? <FormBanner tone="success">Expense {saved} saved</FormBanner> : null}
      {savedCredit ? <FormBanner tone="success">Money received saved</FormBanner> : null}

      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          <Link href={link({ view: 'day' })} className={pill(range.view === 'day')}>
            Day
          </Link>
          <Link href={link({ view: 'month' })} className={pill(range.view === 'month')}>
            Month
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button outline href={link({ date: range.prev })} aria-label="Previous">
            ←
          </Button>
          <span className="min-w-44 text-center text-sm/6 font-medium">{range.label}</span>
          <Button outline href={link({ date: range.next })} aria-label="Next">
            →
          </Button>
          <Button plain href={link({ date: iso(new Date()) })}>
            Today
          </Button>
          <form method="get" action="/daybook" className="flex items-center gap-1">
            <input type="hidden" name="view" value={range.view} />
            {cashOnly ? <input type="hidden" name="mode" value="cash" /> : null}
            <input
              type="date"
              name="date"
              defaultValue={iso(range.anchor)}
              aria-label="Go to date"
              className="rounded-md border border-zinc-950/10 bg-transparent px-2 py-1 text-sm/6 dark:border-white/15"
            />
            <Button type="submit" plain>
              Go
            </Button>
          </form>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          <Link href={link({ mode: null })} className={pill(!cashOnly)}>
            All payments
          </Link>
          <Link href={link({ mode: 'cash' })} className={pill(cashOnly)}>
            Cash only
          </Link>
        </div>
      </div>

      <h1 className="hidden text-lg font-semibold print:block">
        Day book · {range.label}
        {cashOnly ? ' · cash only' : ''}
      </h1>

      {!canSeeReceipts ? (
        <FormBanner tone="error">
          Customer receipts are not visible to your role, so the received side and the balances only
          reflect entries made here.
        </FormBanner>
      ) : null}

      {pages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-950/15 px-4 py-8 text-center text-sm/6 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          Nothing was received or spent{cashOnly ? ' in cash' : ''} in {range.label}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {pages.map((day) => {
            const date = new Date(`${day.key}T00:00:00Z`)

            return (
              <section
                key={day.key}
                aria-label={longDay.format(date)}
                className="overflow-hidden rounded-lg bg-white ring-1 ring-zinc-950/10 break-inside-avoid dark:bg-zinc-900 dark:ring-white/10"
              >
                <header className="grid grid-cols-1 items-center gap-2 border-b border-zinc-950/10 bg-zinc-50 px-4 py-2.5 sm:grid-cols-[1fr_auto_1fr] dark:border-white/10 dark:bg-white/5">
                  <span className="hidden text-sm/6 text-zinc-600 tabular-nums sm:block dark:text-zinc-300">
                    Brought forward <strong>{money.format(day.start)}</strong>
                  </span>
                  <h2 className="text-center text-base/6 font-bold">
                    {longDay.format(date)}
                    {range.view === 'month' ? (
                      <Link
                        href={link({ view: 'day', date: day.key })}
                        className="ml-3 text-xs/5 font-medium text-blue-700 underline print:hidden dark:text-blue-300"
                      >
                        Open this day
                      </Link>
                    ) : null}
                  </h2>
                  <span aria-hidden="true" />
                </header>

                <div className="grid grid-cols-1 divide-zinc-950/10 lg:grid-cols-2 lg:divide-x dark:divide-white/10">
                  <Ledger
                    title="Credit"
                    caption="Money received"
                    tone="credit"
                    lines={day.received}
                    total={day.receivedTotal}
                    canDelete={canDelete}
                    canCheck={canCheck}
                    entry={
                      editable ? (
                        <EntryRow kind="credit" date={day.key} suggestions={sources} />
                      ) : undefined
                    }
                  />
                  <Ledger
                    title="Debit"
                    caption="Money spent"
                    tone="debit"
                    lines={day.spent}
                    total={day.spentTotal}
                    canDelete={canDelete}
                    canCheck={canCheck}
                    entry={
                      editable ? (
                        <EntryRow kind="debit" date={day.key} suggestions={vendors} />
                      ) : undefined
                    }
                  />
                </div>

                {tally && check ? (
                  <DayTally
                    key={day.key}
                    date={day.key}
                    denominations={tallyNotes}
                    banks={tallyBanks}
                    counts={tally.counts}
                    balances={tally.banks}
                    cash={check!.cash}
                    bank={check!.bank}
                    close={dayClose}
                    canEdit={canCheck}
                  />
                ) : null}

                <footer className="flex flex-wrap items-center justify-end gap-x-8 gap-y-1 border-t border-zinc-950/10 bg-zinc-50 px-4 py-2.5 text-sm/6 tabular-nums dark:border-white/10 dark:bg-white/5">
                  <span>
                    Day&apos;s result{' '}
                    <strong
                      className={
                        day.receivedTotal - day.spentTotal < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-lime-700 dark:text-lime-400'
                      }
                    >
                      {money.format(day.receivedTotal - day.spentTotal)}
                    </strong>
                  </span>
                  <span>
                    Carried forward <strong>{money.format(day.end)}</strong>
                  </span>
                </footer>
              </section>
            )
          })}
        </div>
      )}

      <section
        aria-label={`Summary for ${range.label}`}
        className="rounded-lg ring-1 ring-zinc-950/10 break-inside-avoid dark:ring-white/10"
      >
        <h2 className="border-b border-zinc-950/10 px-4 py-2.5 text-base/6 font-semibold dark:border-white/10">
          Summary · {range.label}
          {cashOnly ? ' · cash only' : ''}
        </h2>
        <dl className="grid grid-cols-2 gap-px bg-zinc-950/10 sm:grid-cols-5 dark:bg-white/10">
          {[
            { label: 'Brought forward', value: opening, tone: '' },
            {
              label: 'Total received',
              value: totalReceived,
              tone: 'text-lime-700 dark:text-lime-400',
            },
            { label: 'Total spent', value: totalSpent, tone: 'text-red-600 dark:text-red-400' },
            {
              label: net >= 0 ? 'Net gain' : 'Net loss',
              value: Math.abs(net),
              tone:
                net >= 0 ? 'text-lime-700 dark:text-lime-400' : 'text-red-600 dark:text-red-400',
            },
            {
              label: 'Balance in hand',
              value: closing,
              tone: closing < 0 ? 'text-red-600 dark:text-red-400' : '',
            },
          ].map((tile) => (
            <div key={tile.label} className="bg-white p-4 dark:bg-zinc-900">
              <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">{tile.label}</dt>
              <dd className={`mt-1 text-xl/8 font-semibold tabular-nums ${tile.tone}`}>
                {money.format(tile.value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="px-4 py-2.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Net gain is money received minus money spent in this period. Credit notes are listed for
          reference and are not counted.
        </p>
      </section>
    </div>
  )
}
