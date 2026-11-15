'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { Badge } from '@/components/catalyst/badge'
import {
  addDays,
  addMonths,
  bucketByDay,
  chipOverflow,
  describeTime,
  monthGrid,
  weekDays,
  type CalendarSource,
} from '@/lib/calendar'
import { moneyWhole } from '@/lib/format'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels'
import type { CalendarEntry } from '@/lib/queries/calendar'
import { whatsappLink } from '@/lib/whatsapp'

type Entry = Omit<CalendarEntry, 'startsAt' | 'endsAt' | 'dueDate'> & CalendarSource

type Props = {
  entries: CalendarEntry[]
  view: 'month' | 'week'
  dateKey: string
  todayKey: string
  includeCancelled: boolean
  canCreate: boolean
  /** The industry's word for one order and for many. */
  term: string
  terms: string
  companyName: string
}

const CHIP_CLASSES: Record<CalendarEntry['status'], string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/15',
  CONFIRMED: 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20',
  IN_PRODUCTION: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  READY: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20',
  DISPATCHED: 'bg-purple-50 text-purple-800 ring-purple-200 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/20',
  COMPLETED: 'bg-lime-50 text-lime-800 ring-lime-200 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/20',
  CANCELLED: 'bg-red-50 text-red-700 line-through ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20',
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const monthTitle = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const dayTitle = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const rangeDay = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const at = (key: string) => new Date(`${key}T00:00:00Z`)

function hydrate(entry: CalendarEntry): Entry {
  return {
    ...entry,
    startsAt: entry.startsAt ? new Date(entry.startsAt) : null,
    endsAt: entry.endsAt ? new Date(entry.endsAt) : null,
    dueDate: entry.dueDate ? new Date(entry.dueDate) : null,
  }
}

export function CalendarView(props: Props) {
  const { entries, view, dateKey, todayKey, includeCancelled } = props
  const router = useRouter()

  const buckets = useMemo(() => bucketByDay(entries.map(hydrate)), [entries])

  const href = (next: { view?: string; date?: string; cancelled?: boolean }) => {
    const params = new URLSearchParams({
      view: next.view ?? view,
      date: next.date ?? dateKey,
    })

    if (next.cancelled ?? includeCancelled) params.set('cancelled', '1')

    return `/calendar?${params.toString()}`
  }

  const step = view === 'week' ? 7 : 0
  const previous = step ? addDays(dateKey, -step) : addMonths(dateKey, -1)
  const next = step ? addDays(dateKey, step) : addMonths(dateKey, 1)
  const week = weekDays(dateKey)
  const title =
    view === 'week'
      ? `${rangeDay.format(at(week[0]))} to ${rangeDay.format(at(week[6]))}, ${at(week[6]).getUTCFullYear()}`
      : monthTitle.format(at(dateKey))

  const control =
    'inline-flex items-center rounded-lg px-3 py-1.5 text-sm/6 font-medium ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:ring-white/15 dark:hover:bg-white/5'

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link scroll={false} href={href({ date: previous })} className={control} aria-label="Previous">
          &larr;
        </Link>
        <Link scroll={false} href={href({ date: todayKey })} className={control}>
          Today
        </Link>
        <Link scroll={false} href={href({ date: next })} className={control} aria-label="Next">
          &rarr;
        </Link>
        <h2 className="mx-2 min-w-40 text-base/7 font-semibold">{title}</h2>

        <label className="sr-only" htmlFor="month-picker">
          Jump to month
        </label>
        <input
          id="month-picker"
          type="month"
          value={dateKey.slice(0, 7)}
          onChange={(event) => {
            if (event.target.value) router.push(href({ date: `${event.target.value}-01` }))
          }}
          className="rounded-lg border border-zinc-950/10 bg-transparent px-2 py-1.5 text-sm/6 dark:border-white/15"
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm/6 text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={(event) => router.push(href({ cancelled: event.target.checked }))}
            />
            Show cancelled
          </label>
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/15">
            {(['month', 'week'] as const).map((option) => (
              <Link
                key={option}
                scroll={false}
                href={href({ view: option })}
                aria-current={view === option ? 'true' : undefined}
                className={`px-3 py-1.5 text-sm/6 font-medium ${
                  view === option
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                    : 'hover:bg-zinc-950/5 dark:hover:bg-white/5'
                }`}
              >
                {option === 'month' ? 'Month' : 'Week'}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <>
          <MonthGrid {...props} buckets={buckets} hrefFor={(date) => href({ date })} />
          <MonthAgenda {...props} buckets={buckets} />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {week.map((key) => (
            <DaySection key={key} canCreate={props.canCreate} term={props.term} companyName={props.companyName} todayKey={todayKey} dayKey={key} items={buckets.get(key) ?? []} showEmpty />
          ))}
        </div>
      )}

      <Legend />
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs/5 text-zinc-600 dark:text-zinc-400">
      {(Object.keys(CHIP_CLASSES) as CalendarEntry['status'][]).map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ring-1 ${CHIP_CLASSES[status].split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('ring-')).join(' ')}`} />
          {ORDER_STATUS_LABELS[status]}
        </li>
      ))}
    </ul>
  )
}

function MonthGrid({
  buckets,
  dateKey,
  todayKey,
  canCreate,
  term,
  companyName,
  hrefFor,
}: Props & { buckets: Map<string, Entry[]>; hrefFor: (date: string) => string }) {
  const weeks = monthGrid(dateKey)

  return (
    <div className="hidden md:block">
      <div className="overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
        <div className="grid grid-cols-7 border-b border-zinc-950/10 bg-zinc-50 text-xs/5 font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          {WEEKDAYS.map((name) => (
            <div key={name} className="px-2 py-1.5">
              {name}
            </div>
          ))}
        </div>
        {weeks.map((row) => (
          <div key={row[0].key} className="grid grid-cols-7 border-b border-zinc-950/5 last:border-b-0 dark:border-white/5">
            {row.map((cell) => {
              const items = buckets.get(cell.key) ?? []
              const { visible, more } = chipOverflow(items, 3)
              const selected = cell.key === dateKey
              // An empty day starts a new entry when allowed; otherwise it is just selected.
              const target =
                items.length === 0 && canCreate
                  ? `/orders/new?startsAt=${cell.key}`
                  : hrefFor(cell.key)

              return (
                <div
                  key={cell.key}
                  className={`relative min-h-28 border-l border-zinc-950/5 p-1.5 first:border-l-0 dark:border-white/5 ${
                    cell.inMonth ? '' : 'bg-zinc-50/60 text-zinc-400 dark:bg-white/[0.02]'
                  } ${selected ? 'ring-2 ring-inset ring-accent-500' : ''}`}
                >
                  <Link
                    href={target}
                    scroll={false}
                    aria-label={`${dayTitle.format(at(cell.key))}${items.length ? `, ${items.length} entries` : ''}`}
                    className="absolute inset-0"
                  />
                  <span
                    className={`relative inline-flex size-6 items-center justify-center rounded-full text-xs/5 ${
                      cell.key === todayKey ? 'bg-zinc-950 font-semibold text-white dark:bg-white dark:text-zinc-950' : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                  <ul className="relative mt-1 grid gap-1">
                    {visible.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          href={`/orders/${entry.id}`}
                          title={`${entry.number} · ${entry.customerName}`}
                          className={`block truncate rounded px-1.5 py-0.5 text-xs/5 ring-1 ring-inset ${CHIP_CLASSES[entry.status]}`}
                        >
                          {chipTime(entry)}
                          {entry.customerName}
                        </Link>
                      </li>
                    ))}
                    {more > 0 ? (
                      <li>
                        <Link
                          href={hrefFor(cell.key)}
                          scroll={false}
                          className="px-1.5 text-xs/5 font-medium text-zinc-600 hover:underline dark:text-zinc-400"
                        >
                          +{more} more
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <DaySection
          dayKey={dateKey}
          items={buckets.get(dateKey) ?? []}
          showEmpty
          canCreate={canCreate}
          term={term}
          companyName={companyName}
          todayKey={todayKey}
        />
      </div>
    </div>
  )
}

function chipTime(entry: Entry) {
  const time = entry.startsAt ? describeTime(entry.startsAt, null) : null

  return time ? `${time.replace(' am', 'a').replace(' pm', 'p')} ` : ''
}

/** Small screens: no grid, just the month's days that have something on. */
function MonthAgenda(props: Props & { buckets: Map<string, Entry[]> }) {
  const days = [...props.buckets.keys()]
    .filter((key) => key.startsWith(props.dateKey.slice(0, 7)))
    .sort()

  return (
    <div className="grid grid-cols-1 gap-4 md:hidden">
      {days.length === 0 ? (
        <p className="rounded-lg p-6 text-center text-sm/6 text-zinc-600 ring-1 ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/10">
          Nothing scheduled this month.
          {props.canCreate ? (
            <>
              {' '}
              <Link className="font-medium underline" href={`/orders/new?startsAt=${props.dateKey}`}>
                Add a {props.term.toLowerCase()}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {days.map((key) => (
        <DaySection key={key} canCreate={props.canCreate} term={props.term} companyName={props.companyName} todayKey={props.todayKey} dayKey={key} items={props.buckets.get(key) ?? []} />
      ))}
    </div>
  )
}

function DaySection({
  dayKey,
  items,
  showEmpty,
  canCreate,
  term,
  companyName,
  todayKey,
}: Pick<Props, 'canCreate' | 'term' | 'companyName' | 'todayKey'> & {
  dayKey: string
  items: Entry[]
  showEmpty?: boolean
}) {
  if (items.length === 0 && !showEmpty) return null

  return (
    <section aria-label={dayTitle.format(at(dayKey))}>
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-950/10 pb-1 dark:border-white/10">
        <h3 className="text-sm/6 font-semibold">
          {dayTitle.format(at(dayKey))}
          {dayKey === todayKey ? (
            <span className="ml-2 text-xs/5 font-medium text-zinc-500">Today</span>
          ) : null}
        </h3>
        {canCreate ? (
          <Link
            href={`/orders/new?startsAt=${dayKey}`}
            className="text-sm/6 font-medium text-zinc-700 hover:underline dark:text-zinc-300"
          >
            + New {term.toLowerCase()}
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-sm/6 text-zinc-500">Nothing on this day.</p>
      ) : (
        <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
          {items.map((entry) => (
            <AgendaRow key={entry.id} entry={entry} dayKey={dayKey} companyName={companyName} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AgendaRow({
  entry,
  dayKey,
  companyName,
}: {
  entry: Entry
  dayKey: string
  companyName: string
}) {
  const time = entry.startsAt ? describeTime(entry.startsAt, entry.endsAt) : null
  const dueNote = !entry.startsAt ? 'Due (all day)' : null

  const message = [
    `Hi ${entry.customerName},`,
    `Your ${entry.number}${entry.venue ? ` at ${entry.venue}` : ''} is coming up on ${dayTitle.format(at(dayKey))}.`,
    entry.received > 0
      ? `We have received ${moneyWhole.format(entry.received)} of ${moneyWhole.format(entry.total)}.`
      : `The total is ${moneyWhole.format(entry.total)}.`,
    `Could you please pay the deposit of ${moneyWhole.format(entry.balance)} to confirm it?`,
    `Thank you, ${companyName}`,
  ].join(' ')

  return (
    <li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-start sm:gap-4">
      <div className="text-sm/6 font-medium text-zinc-700 dark:text-zinc-300">
        {time ?? dueNote ?? 'All day'}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/orders/${entry.id}`} className="font-medium text-zinc-950 hover:underline dark:text-white">
            {entry.number}
          </Link>
          <Badge color={ORDER_STATUS_COLORS[entry.status]}>{ORDER_STATUS_LABELS[entry.status]}</Badge>
        </div>
        <div className="text-sm/6 text-zinc-600 dark:text-zinc-400">
          {entry.customerName}
          {entry.subject ? ` · ${entry.subject}` : ''}
        </div>
        {entry.venue || entry.headcount !== null ? (
          <div className="text-sm/6 text-zinc-500">
            {[entry.venue, entry.headcount !== null ? `${entry.headcount} guests` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        ) : null}
      </div>
      <div className="text-sm/6 sm:text-right">
        <div className="tabular-nums text-zinc-600 dark:text-zinc-400">
          Total {moneyWhole.format(entry.total)} · Received {moneyWhole.format(entry.received)}
        </div>
        <div
          className={`font-medium tabular-nums ${
            entry.balance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-lime-700 dark:text-lime-400'
          }`}
        >
          {entry.balance > 0 ? `Balance ${moneyWhole.format(entry.balance)}` : 'Paid in full'}
        </div>
        {entry.balance > 0 && entry.status !== 'CANCELLED' ? (
          <a
            href={whatsappLink(entry.customerPhone, message)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-medium text-zinc-950 underline dark:text-white"
          >
            Request deposit on WhatsApp
          </a>
        ) : null}
      </div>
    </li>
  )
}
