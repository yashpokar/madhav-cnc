'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox'
import { Label } from '@/components/catalyst/fieldset'
import { MonthPicker } from '@/components/catalyst/month-picker'
import {
  addDays,
  addMonths,
  bucketByDay,
  chipOverflow,
  describeTime,
  LAYER_RANK,
  layersParam,
  monthGrid,
  spanOf,
  weekDays,
  type CalendarSource,
  type LayerKey,
} from '@/lib/calendar'
import { moneyWhole } from '@/lib/format'
import {
  DISPATCH_STATUS_COLORS,
  DISPATCH_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/labels'
import type { CalendarEntry, CalendarItem } from '@/lib/queries/calendar'
import { whatsappLink } from '@/lib/whatsapp'
import {
  BanknotesIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  TruckIcon,
} from '@heroicons/react/16/solid'

type Hydrated<T> = T extends unknown
  ? Omit<T, 'startsAt' | 'endsAt' | 'dueDate' | 'orderDate'> & CalendarSource
  : never
type Item = Hydrated<CalendarItem>
type OrderItem = Extract<Item, { kind: 'order' }>

type Props = {
  entries: CalendarItem[]
  layers: LayerKey[]
  allowedLayers: LayerKey[]
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

function hydrate(entry: CalendarItem): Item {
  return {
    ...entry,
    startsAt: entry.startsAt ? new Date(entry.startsAt) : null,
    endsAt: entry.endsAt ? new Date(entry.endsAt) : null,
    dueDate: entry.dueDate ? new Date(entry.dueDate) : null,
    orderDate: 'orderDate' in entry ? new Date(entry.orderDate) : null,
  } as Item
}

const LAYER_OF = {
  order: 'orders',
  delivery: 'deliveries',
  invoice: 'invoices',
  payments: 'payments',
} as const

const rank = (item: Item) => LAYER_RANK[LAYER_OF[item.kind]]

function itemHref(item: Item) {
  switch (item.kind) {
    case 'order':
      return `/orders/${item.id}`
    case 'delivery':
      return `/dispatch/${item.dispatchId}`
    case 'invoice':
      return `/invoices/${item.id}`
    case 'payments':
      return item.count === 1 ? `/payments/${item.payments[0].id}` : '/payments'
  }
}

const LAYER_META: Record<LayerKey, { label: string; icon: typeof TruckIcon; dot: string }> = {
  orders: { label: 'Bookings', icon: CalendarDaysIcon, dot: 'text-blue-600 dark:text-blue-400' },
  deliveries: { label: 'Deliveries', icon: TruckIcon, dot: 'text-purple-600 dark:text-purple-400' },
  invoices: { label: 'Invoices due', icon: DocumentTextIcon, dot: 'text-amber-600 dark:text-amber-400' },
  payments: { label: 'Payments received', icon: BanknotesIcon, dot: 'text-emerald-600 dark:text-emerald-400' },
}

const DELIVERY_CHIP: Record<string, string> = {
  DRAFT: CHIP_CLASSES.DRAFT,
  DISPATCHED: CHIP_CLASSES.DISPATCHED,
  DELIVERED: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
}
const INVOICE_CHIP = 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20'
const OVERDUE_CHIP = 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20'
const PAYMENT_CHIP = 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20'

export function CalendarView(props: Props) {
  const { entries, view, dateKey, todayKey, includeCancelled, layers, allowedLayers } = props
  const router = useRouter()

  const buckets = useMemo(() => bucketByDay(entries.map(hydrate), rank), [entries])

  const href = (next: {
    view?: string
    date?: string
    cancelled?: boolean
    layers?: LayerKey[]
  }) => {
    const params = new URLSearchParams({
      view: next.view ?? view,
      date: next.date ?? dateKey,
      layers: layersParam(next.layers ?? layers),
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

  const visibleKeys = view === 'week' ? week : [...buckets.keys()].filter((key) => key.startsWith(dateKey.slice(0, 7)))
  const empty = !visibleKeys.some((key) => (buckets.get(key)?.length ?? 0) > 0)

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

        <div className="w-44">
          <MonthPicker
            aria-label="Jump to month"
            value={dateKey.slice(0, 7)}
            required
            onChange={(event) => {
              if (event.target.value) router.push(href({ date: `${event.target.value}-01` }))
            }}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {layers.includes('orders') ? (
            <CheckboxField>
              <Checkbox
                name="cancelled"
                checked={includeCancelled}
                onChange={(checked) => router.push(href({ cancelled: checked }))}
              />
              <Label>Show cancelled</Label>
            </CheckboxField>
          ) : null}
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

      <LayerToggles layers={layers} allowed={allowedLayers} hrefFor={(next) => href({ layers: next })} />

      {empty ? (
        <EmptyState
          when={view === 'week' ? 'this week' : monthTitle.format(at(dateKey))}
          canCreate={props.canCreate}
          term={props.term}
        />
      ) : null}

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

      {layers.includes('orders') ? <Legend /> : null}
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

function LayerToggles({
  layers,
  allowed,
  hrefFor,
}: {
  layers: LayerKey[]
  allowed: LayerKey[]
  hrefFor: (layers: LayerKey[]) => string
}) {
  return (
    <div role="group" aria-label="Show on the calendar" className="flex flex-wrap items-center gap-2">
      {allowed.map((key) => {
        const on = layers.includes(key)
        const Icon = LAYER_META[key].icon
        const next = on ? layers.filter((layer) => layer !== key) : [...layers, key]

        return (
          <Link
            key={key}
            scroll={false}
            href={hrefFor(next)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm/6 font-medium ring-1 ring-inset ${
              on
                ? 'bg-accent-50 text-accent-800 ring-accent-300 dark:bg-white/10 dark:text-white dark:ring-white/20'
                : 'text-zinc-500 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-400 dark:ring-white/15 dark:hover:bg-white/5'
            }`}
          >
            <Icon className={`size-4 ${on ? LAYER_META[key].dot : ''}`} />
            {LAYER_META[key].label}
          </Link>
        )
      })}
    </div>
  )
}

function EmptyState({ when, canCreate, term }: { when: string; canCreate: boolean; term: string }) {
  return (
    <div className="flex flex-col items-center gap-3 surface-card p-8 text-center">
      <CalendarDaysIcon className="size-6 text-zinc-400" />
      <p className="text-sm/6 text-zinc-600 dark:text-zinc-400">
        Nothing scheduled in {when}. Add a {term.toLowerCase()} or change the layers.
      </p>
      {canCreate ? <Button href="/orders/new">New {term.toLowerCase()}</Button> : null}
    </div>
  )
}

function chipClass(item: Item, todayKey: string) {
  switch (item.kind) {
    case 'order':
      return CHIP_CLASSES[item.status]
    case 'delivery':
      return DELIVERY_CHIP[item.status] ?? DELIVERY_CHIP.DISPATCHED
    case 'invoice':
      return item.dueDate && item.dueDate.toISOString().slice(0, 10) < todayKey
        ? OVERDUE_CHIP
        : INVOICE_CHIP
    case 'payments':
      return PAYMENT_CHIP
  }
}

function chipLabel(item: Item) {
  switch (item.kind) {
    case 'order':
      return `${chipTime(item)}${item.customerName}`
    case 'delivery':
      return `${item.event === 'delivered' ? 'Delivered' : 'Dispatched'} ${item.customerName}`
    case 'invoice':
      return `Due ${moneyWhole.format(item.due)} ${item.customerName}`
    case 'payments':
      return `Received ${moneyWhole.format(item.total)} (${item.count})`
  }
}

function chipTitle(item: Item) {
  switch (item.kind) {
    case 'order': {
      const basis = spanOf(item)?.basis

      return `${item.number} · ${item.customerName}${
        basis === 'order' ? ' · shown on its order date' : basis === 'due' ? ' · shown on its due date' : ''
      }`
    }
    case 'delivery':
      return `${item.number} · ${item.customerName} · ${DISPATCH_STATUS_LABELS[item.status]}`
    case 'invoice':
      return `${item.number} · ${item.customerName} · ${moneyWhole.format(item.due)} due`
    case 'payments':
      return `${item.count} payment${item.count === 1 ? '' : 's'} received, ${moneyWhole.format(item.total)}`
  }
}

function ItemIcon({ item, className }: { item: Item; className?: string }) {
  const Icon =
    item.kind === 'order'
      ? CalendarDaysIcon
      : item.kind === 'delivery'
        ? TruckIcon
        : item.kind === 'invoice'
          ? DocumentTextIcon
          : BanknotesIcon

  return <Icon aria-hidden className={className ?? 'size-3.5 shrink-0'} />
}

function MonthGrid({
  buckets,
  dateKey,
  todayKey,
  canCreate,
  term,
  companyName,
  hrefFor,
}: Props & { buckets: Map<string, Item[]>; hrefFor: (date: string) => string }) {
  const weeks = monthGrid(dateKey)

  return (
    <div className="hidden md:block">
      <div className="overflow-hidden surface-card">
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
                    {visible.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={itemHref(item)}
                          title={chipTitle(item)}
                          className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs/5 ring-1 ring-inset ${chipClass(item, todayKey)}`}
                        >
                          <ItemIcon item={item} className="size-3 shrink-0 opacity-70" />
                          <span className="truncate">{chipLabel(item)}</span>
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

function chipTime(entry: Item) {
  const time = entry.startsAt ? describeTime(entry.startsAt, null) : null

  return time ? `${time.replace(' am', 'a').replace(' pm', 'p')} ` : ''
}

/** Small screens: no grid, just the month's days that have something on. */
function MonthAgenda(props: Props & { buckets: Map<string, Item[]> }) {
  const days = [...props.buckets.keys()]
    .filter((key) => key.startsWith(props.dateKey.slice(0, 7)))
    .sort()

  return (
    <div className="grid grid-cols-1 gap-4 md:hidden">
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
  items: Item[]
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
          {items.map((item) => (
            <AgendaRow key={item.id} item={item} dayKey={dayKey} todayKey={todayKey} companyName={companyName} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AgendaRow({
  item,
  dayKey,
  todayKey,
  companyName,
}: {
  item: Item
  dayKey: string
  todayKey: string
  companyName: string
}) {
  if (item.kind === 'order') {
    return <OrderRow entry={item} dayKey={dayKey} companyName={companyName} />
  }

  const time = item.startsAt ? describeTime(item.startsAt, null) : null
  const overdue = item.kind === 'invoice' && dayKey < todayKey
  let title: React.ReactNode
  let detail: string
  let badge: React.ReactNode = null

  if (item.kind === 'delivery') {
    title = item.number
    detail = `${item.event === 'delivered' ? 'Delivered' : 'Dispatched'} for ${item.orderNumber} · ${item.customerName}`
    badge = (
      <Badge color={DISPATCH_STATUS_COLORS[item.status]}>{DISPATCH_STATUS_LABELS[item.status]}</Badge>
    )
  } else if (item.kind === 'invoice') {
    title = item.number
    detail = `${item.customerName} · invoice total ${moneyWhole.format(item.total)}`
    badge = overdue ? <Badge color="red">Overdue</Badge> : <Badge color="amber">Due</Badge>
  } else {
    title = `Received ${moneyWhole.format(item.total)} (${item.count})`
    detail = ''
  }

  return (
    <li className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-start sm:gap-4">
      <div className="flex items-center gap-1.5 text-sm/6 font-medium text-zinc-700 dark:text-zinc-300">
        <ItemIcon item={item} className="size-4 shrink-0 text-zinc-500" />
        {time ?? LAYER_META[LAYER_OF[item.kind]].label}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.kind === 'payments' ? (
            <span className="font-medium">{title}</span>
          ) : (
            <Link href={itemHref(item)} className="font-medium text-zinc-950 hover:underline dark:text-white">
              {title}
            </Link>
          )}
          {badge}
        </div>
        {detail ? <div className="text-sm/6 text-zinc-600 dark:text-zinc-400">{detail}</div> : null}
        {item.kind === 'payments' ? (
          <ul className="text-sm/6 text-zinc-600 dark:text-zinc-400">
            {item.payments.map((payment) => (
              <li key={payment.id}>
                <Link href={`/payments/${payment.id}`} className="hover:underline">
                  {payment.number}
                </Link>{' '}
                · {payment.customerName} · {moneyWhole.format(payment.amount)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {item.kind === 'invoice' ? (
        <div
          className={`text-sm/6 font-medium tabular-nums sm:text-right ${
            overdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {moneyWhole.format(item.due)} due
        </div>
      ) : null}
    </li>
  )
}

function OrderRow({
  entry,
  dayKey,
  companyName,
}: {
  entry: OrderItem
  dayKey: string
  companyName: string
}) {
  const time = entry.startsAt ? describeTime(entry.startsAt, entry.endsAt) : null
  const basis = spanOf(entry)?.basis
  const dueNote =
    basis === 'due' ? 'Due (all day)' : basis === 'order' ? 'On its order date' : null

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
