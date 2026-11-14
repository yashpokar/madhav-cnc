import { money } from '@/lib/format'
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
import { listCashCreditSources } from '@/lib/queries/accounting'
import { listVendorOptions } from '@/lib/queries/vendors'
import { listCustomerOptions } from '@/lib/queries/quotations'
import {
  getDayClose,
  getDaybookLayout,
  getDayTally,
  listBankAccounts,
  listChannels,
  listDenominations,
  reconcile,
} from '@/lib/queries/daybook'
import { requireCapability } from '@/lib/session'
import type { PaymentMode } from '@/generated/prisma/enums'
import { CheckCell } from './check-cell'
import { DateJump } from './date-jump'
import { DayTally } from './day-tally'
import { EntryRow } from './entry-row'

export const metadata: Metadata = {
  title: 'Day book',
}

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
  /** The business's own name for how it was paid, e.g. HDFC NEFT. */
  channelName?: string
}

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
  extras,
  compact,
}: {
  title: string
  caption: string
  tone: 'credit' | 'debit'
  lines: Line[]
  total: number
  canDelete: boolean
  canCheck: boolean
  /** The typed-in composer at the bottom; omitted when the book is read-only. */
  entry?: React.ReactNode
  /** Credit and debit notes under the credit total, as on the sheet. */
  extras?: { cn: number; dn: number }
  compact: boolean
}) {
  const accent =
    tone === 'credit' ? 'text-lime-700 dark:text-lime-400' : 'text-red-600 dark:text-red-400'
  const dot = tone === 'credit' ? 'bg-lime-500' : 'bg-red-500'
  const pad = compact ? 'py-1.5' : 'py-3'
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
    <div className="min-w-0 p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base/6 font-semibold">
            <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
            {title}
          </h3>
          <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">{caption}</p>
        </div>
        <p className={`text-xl/7 font-semibold tabular-nums ${accent}`}>{money.format(total)}</p>
      </div>

      {lines.length > 0 ? (
        <ul className="mt-3 divide-y divide-zinc-950/5 dark:divide-white/10">
          {lines.map((line) => {
            const reference = line.kind === 'note'
            const how = reference
              ? 'Credit note'
              : (line.channelName ?? (line.mode ? PAYMENT_MODE_LABELS[line.mode] : ''))
            const name = <span className="font-medium">{line.name}</span>

            return (
              <li
                key={line.id}
                className={`group grid grid-cols-[1.75rem_1fr_auto_2rem] items-center gap-x-3 ${pad} ${
                  reference ? 'text-zinc-500 italic' : ''
                }`}
              >
                <span className="flex justify-center">{tick(line)}</span>
                <span className="min-w-0">
                  {line.href ? (
                    <Link href={line.href} className="block truncate hover:underline">
                      {name}
                    </Link>
                  ) : (
                    <span className="block truncate">{name}</span>
                  )}
                  <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {[how, line.note].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span
                  className={`text-sm/6 tabular-nums ${reference ? '' : `font-semibold ${accent}`}`}
                >
                  {money.format(line.amount)}
                </span>
                <span className="flex justify-end opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 print:hidden">
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
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-950/10 px-4 py-6 text-center text-sm/6 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Nothing {tone === 'credit' ? 'received' : 'spent'} yet.
        </p>
      )}

      {entry}

      {extras ? (
        <dl className="mt-4 grid gap-1 border-t border-zinc-950/5 pt-3 text-sm/6 tabular-nums dark:border-white/10">
          <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
            <dt>CN (credit notes)</dt>
            <dd>+ {money.format(extras.cn)}</dd>
          </div>
          <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
            <dt>DN (debit notes)</dt>
            <dd>− {money.format(extras.dn)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Grand TOTAL</dt>
            <dd className={accent}>{money.format(total + extras.cn - extras.dn)}</dd>
          </div>
        </dl>
      ) : null}
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
  const modeFilter = cashOnly ? { equals: 'CASH' as const } : undefined
  const inRange = { gte: range.from, lte: range.to }

  const layout = await getDaybookLayout()
  const compact = layout.density === 'compact'
  const stacked = layout.sides === 'stacked'

  const [
    expenses,
    receipts,
    credits,
    notes,
    priorExpenses,
    priorReceipts,
    priorCredits,
    vendors,
    customerOptions,
    sources,
    channels,
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
        channel: { select: { name: true } },
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
            channel: { select: { name: true } },
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
        channel: { select: { name: true } },
      },
    }),
    // Credit (CN) and debit (DN) notes move no cash. They add to and take from
    // the credit side's grand total, and are left out when limited to cash.
    canSeeNotes && !cashOnly
      ? prisma.creditDebitNote.findMany({
          where: { status: 'ISSUED', noteDate: inRange },
          select: { kind: true, noteDate: true, total: true },
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
    canCreate ? listVendorOptions() : [],
    canCreate && canSeeReceipts && can(user.role, 'customer:read') ? listCustomerOptions() : null,
    canCreate ? listCashCreditSources() : [],
    canCreate ? listChannels(true) : [],
  ])

  const opening =
    (priorReceipts?._sum.amount?.toNumber() ?? 0) +
    (priorCredits._sum.amount?.toNumber() ?? 0) -
    (priorExpenses._sum.total?.toNumber() ?? 0)

  // Group by day so a month reads as a sequence of daily pages.
  const days = new Map<string, { received: Line[]; spent: Line[]; cn: number; dn: number }>()
  const dayOf = (key: string) => {
    const existing = days.get(key) ?? { received: [], spent: [], cn: 0, dn: 0 }
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
      channelName: p.channel?.name,
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
      channelName: c.channel?.name,
    })
  }
  for (const n of notes) {
    const day = dayOf(iso(n.noteDate))

    if (n.kind === 'CREDIT') day.cn += n.total.toNumber()
    else day.dn += n.total.toNumber()
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
      channelName: e.channel?.name,
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
      cn: number
      dn: number
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
        cn: day.cn,
        dn: day.dn,
        start,
        end: start + receivedTotal - spentTotal,
      },
    ]
  }, [])

  const totalReceived = pages.reduce((t, p) => t + p.receivedTotal, 0)
  const totalSpent = pages.reduce((t, p) => t + p.spentTotal, 0)
  const totalCn = pages.reduce((t, p) => t + p.cn, 0)
  const totalDn = pages.reduce((t, p) => t + p.dn, 0)
  // Cash in hand moves only with money; notes change the gain, not the drawer.
  const moneyNet = totalReceived - totalSpent
  const net = moneyNet + totalCn - totalDn
  const closing = opening + moneyNet
  const showNotes = canSeeNotes && !cashOnly

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
              ? ' Add entries in the box under each side.'
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
          {canCreate ? <Button href="/expenses/new">Add bill</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          <Link href={link({ view: 'day' })} className={pill(range.view === 'day')}>
            Day
          </Link>
          <Link href={link({ view: 'month' })} className={pill(range.view === 'month')}>
            Month
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <Button outline href={link({ date: range.prev })} aria-label="Previous">
            ←
          </Button>
          {range.view === 'day' ? (
            <div className="w-48">
              <DateJump date={iso(range.anchor)} view={range.view} cashOnly={cashOnly} />
            </div>
          ) : (
            <span className="min-w-40 px-2 text-center text-sm/6 font-medium">{range.label}</span>
          )}
          <Button outline href={link({ date: range.next })} aria-label="Next">
            →
          </Button>
          <Button plain href={link({ date: iso(new Date()) })}>
            Today
          </Button>
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
                className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-zinc-950/10 break-inside-avoid dark:bg-zinc-900 dark:ring-white/10"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-zinc-950/5 px-5 py-4 dark:border-white/10">
                  <h2 className="text-lg/7 font-semibold tracking-tight">
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
                  <span className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
                    Brought forward{' '}
                    <strong className="font-semibold text-zinc-950 dark:text-white">
                      {money.format(day.start)}
                    </strong>
                  </span>
                </header>

                <div
                  className={`grid grid-cols-1 divide-zinc-950/5 dark:divide-white/10 ${
                    stacked ? 'divide-y' : 'lg:grid-cols-2 lg:divide-x'
                  }`}
                >
                  <Ledger
                    title="Credit"
                    caption="Money received"
                    tone="credit"
                    lines={day.received}
                    total={day.receivedTotal}
                    extras={showNotes ? { cn: day.cn, dn: day.dn } : undefined}
                    canDelete={canDelete}
                    canCheck={canCheck}
                    compact={compact}
                    entry={
                      editable ? (
                        <EntryRow
                          kind="credit"
                          date={day.key}
                          suggestions={sources}
                          customers={customerOptions ?? undefined}
                          channels={channels}
                        />
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
                    compact={compact}
                    entry={
                      editable ? (
                        <EntryRow
                          kind="debit"
                          date={day.key}
                          suggestions={[]}
                          vendors={vendors}
                          channels={channels}
                        />
                      ) : undefined
                    }
                  />
                </div>

                {tally && check && layout.tally.show ? (
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
                    layout={layout.tally}
                  />
                ) : null}

                <footer className="flex flex-wrap items-center justify-end gap-x-8 gap-y-1 border-t border-zinc-950/5 bg-zinc-50/60 px-5 py-3 text-sm/6 tabular-nums dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="text-zinc-500 dark:text-zinc-400">
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
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Carried forward{' '}
                    <strong className="font-semibold text-zinc-950 dark:text-white">
                      {money.format(day.end)}
                    </strong>
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
        <dl className="grid grid-cols-2 overflow-hidden sm:grid-cols-4 [&>*]:border-r [&>*]:border-b [&>*]:border-zinc-950/5 dark:[&>*]:border-white/10">
          {[
            { label: 'Brought forward', value: opening, tone: '' },
            {
              label: 'Total received',
              value: totalReceived,
              tone: 'text-lime-700 dark:text-lime-400',
            },
            ...(showNotes
              ? [
                  { label: 'Credit notes (CN) +', value: totalCn, tone: '' },
                  { label: 'Debit notes (DN) −', value: totalDn, tone: '' },
                ]
              : []),
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
          Net gain is money received, plus credit notes, minus debit notes, minus money spent in
          this period. Balance in hand moves only with money, so notes do not change it.
        </p>
      </section>
    </div>
  )
}
