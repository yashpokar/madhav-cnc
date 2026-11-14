import { Link } from '@/components/catalyst/link'

/** The surface every dashboard card sits on. */
export const CARD =
  'rounded-xl bg-white shadow-xs ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10'

export const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export const shortDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function Panel({
  title,
  href,
  linkLabel = 'View all',
  empty,
  children,
}: {
  title: string
  href?: string
  linkLabel?: string
  empty: string
  children: React.ReactNode[] | React.ReactNode
}) {
  const rows = Array.isArray(children) ? children : [children]

  return (
    <section className={CARD}>
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-sm/6 font-semibold text-zinc-950 dark:text-white">
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="text-xs/5 font-medium text-zinc-600 underline decoration-zinc-950/20 underline-offset-2 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
          >
            {linkLabel}
          </Link>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="px-4 pt-2 pb-5 text-sm/6 text-zinc-500 dark:text-zinc-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-950/5 pb-2 dark:divide-white/5">
          {rows}
        </ul>
      )}
    </section>
  )
}

export function Row({
  href,
  title,
  subtitle,
  trailing,
  trailingTone = 'default',
}: {
  href: string
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  trailingTone?: 'default' | 'warn'
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm/6 font-medium text-zinc-950 dark:text-white">
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span
            className={`shrink-0 text-xs/5 tabular-nums ${
              trailingTone === 'warn'
                ? 'font-medium text-red-600 dark:text-red-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {trailing}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

/** "▲ 12% vs yesterday", or nothing useful to compare. */
function delta(current: number, previous: number, goodWhenUp: boolean, versus: string) {
  if (previous === 0 && current === 0) return { text: `same as ${versus}`, tone: 'flat' as const }
  if (previous === 0) return { text: `new vs ${versus}`, tone: goodWhenUp ? ('good' as const) : ('bad' as const) }

  const change = Math.round(((current - previous) / previous) * 100)

  if (change === 0) return { text: `same as ${versus}`, tone: 'flat' as const }

  const up = change > 0

  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(change)}% vs ${versus}`,
    tone: up === goodWhenUp ? ('good' as const) : ('bad' as const),
  }
}

/** A figure for the chosen period, with how it compares to the period before. */
export function PeriodTile({
  href,
  label,
  value,
  current,
  previous,
  goodWhenUp = true,
  versus,
  note,
  tone = 'default',
}: {
  href?: string
  label: string
  value: string
  current: number
  previous: number
  goodWhenUp?: boolean
  versus: string
  note?: string
  tone?: 'default' | 'good' | 'bad'
}) {
  const change = delta(current, previous, goodWhenUp, versus)
  const accent =
    tone === 'good'
      ? 'text-lime-700 dark:text-lime-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-zinc-950 dark:text-white'
  const changeColor =
    change.tone === 'good'
      ? 'text-lime-700 dark:text-lime-400'
      : change.tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-zinc-500 dark:text-zinc-400'
  const body = (
    <>
      <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-2xl/8 font-semibold tracking-tight tabular-nums ${accent}`}>
        {value}
      </div>
      <div className={`mt-0.5 text-xs/5 ${changeColor}`}>{change.text}</div>
      {note ? <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{note}</div> : null}
    </>
  )
  const box = `block p-4 ${CARD}`

  return href ? (
    <Link href={href} className={`${box} transition hover:bg-zinc-50 dark:hover:bg-white/5`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}

const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Money in against money out, one pair of bars per day (or week). */
export function MoneyBars({
  buckets,
  weekly,
}: {
  buckets: { start: Date; end: Date; received: number; spent: number }[]
  weekly: boolean
}) {
  const top = Math.max(1, ...buckets.flatMap((b) => [b.received, b.spent]))
  const name = (b: { start: Date; end: Date }) =>
    weekly ? `${day.format(b.start)} – ${day.format(b.end)}` : day.format(b.start)

  return (
    <figure>
      <div className="flex h-36 items-end gap-1" role="img" aria-label="Money in and money out over the period">
        {buckets.map((b) => (
          <div
            key={b.start.toISOString()}
            className="group flex h-full min-w-0 flex-1 items-end justify-center gap-px"
            title={`${name(b)}: in ${inr.format(b.received)}, out ${inr.format(b.spent)}`}
          >
            <span
              className="w-full max-w-3 rounded-t bg-lime-500/80 group-hover:bg-lime-500"
              style={{ height: `${Math.max(b.received > 0 ? 2 : 0, (b.received / top) * 100)}%` }}
            />
            <span
              className="w-full max-w-3 rounded-t bg-red-500/70 group-hover:bg-red-500"
              style={{ height: `${Math.max(b.spent > 0 ? 2 : 0, (b.spent / top) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex items-center justify-between text-xs/5 text-zinc-500 dark:text-zinc-400">
        <span>{name(buckets[0])}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="size-2 rounded-full bg-lime-500" /> Money in
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="size-2 rounded-full bg-red-500" /> Money out
          </span>
        </span>
        <span>{name(buckets[buckets.length - 1])}</span>
      </figcaption>
    </figure>
  )
}

/** Live counts that do not depend on the period, as one card split into cells. */
export function NowStrip({
  items,
}: {
  items: {
    href: string
    label: string
    value: React.ReactNode
    hint?: string
    tone?: 'default' | 'warn'
  }[]
}) {
  if (items.length === 0) return null

  return (
    <section aria-label="Right now" className={`${CARD} overflow-hidden`}>
      <h2 className="px-4 pt-4 text-sm/6 font-semibold">Right now</h2>
      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="border-t border-zinc-950/5 px-4 py-3 transition hover:bg-zinc-50 sm:border-l sm:first:border-l-0 dark:border-white/10 dark:hover:bg-white/5"
          >
            <dt className="text-xs/5 text-zinc-500 dark:text-zinc-400">{item.label}</dt>
            <dd
              className={`text-xl/7 font-semibold tabular-nums ${
                item.tone === 'warn' ? 'text-red-600 dark:text-red-400' : ''
              }`}
            >
              {item.value}
            </dd>
            {item.hint ? (
              <dd className="truncate text-xs/5 text-zinc-500 dark:text-zinc-400">{item.hint}</dd>
            ) : null}
          </Link>
        ))}
      </dl>
    </section>
  )
}
