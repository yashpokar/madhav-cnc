import { moneyWhole, dateShort } from '@/lib/format'

const day = dateShort
import { Link } from '@/components/catalyst/link'

/** The surface every dashboard card sits on. */
export const CARD =
  'rounded-xl bg-white shadow-xs ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10'

/** Whole-rupee money and short dates, as the dashboard shows them. */
export const inr = moneyWhole
export const shortDate = dateShort

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

/** "▲ 12%" as a small tinted pill; flat or unknown comparisons stay quiet text. */
function DeltaPill({ change }: { change: ReturnType<typeof delta> }) {
  const tint =
    change.tone === 'good'
      ? 'bg-lime-100 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300'
      : change.tone === 'bad'
        ? 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300'
        : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs/4 font-medium ${tint}`}>
      {change.text}
    </span>
  )
}

/**
 * A figure for the chosen period, with how it compares to the period before.
 * "hero" is a card of its own for the two numbers the day turns on; "compact"
 * is a cell in the quieter strip underneath.
 */
export function PeriodTile({
  href,
  label,
  value,
  current,
  previous,
  goodWhenUp = true,
  versus,
  note,
  size = 'compact',
  status,
  share,
  tone = 'default',
}: {
  href?: string
  label: string
  value: string
  current?: number
  /** Leave out for a figure that is a position today, not a period total. */
  previous?: number
  goodWhenUp?: boolean
  versus?: string
  note?: string
  size?: 'hero' | 'compact'
  /** Replaces the comparison, for a figure that is a position rather than a period total. */
  status?: { text: string; tone: 'good' | 'bad' | 'flat' }
  /** 0 to 1: a thin bar for this share of the figure (the overdue part of what is due). */
  share?: number
  tone?: 'default' | 'good' | 'bad'
}) {
  const change =
    status ??
    (current === undefined || previous === undefined || !versus
      ? null
      : delta(current, previous, goodWhenUp, versus))
  const hero = size === 'hero'
  const accent =
    tone === 'good'
      ? 'text-lime-700 dark:text-lime-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-zinc-950 dark:text-white'
  // "same as yesterday" is not news: show it as plain muted text, not a pill.
  const quiet = change?.tone === 'flat'
  const comparison = change ? (
    quiet ? (
      <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">{change.text}</span>
    ) : (
      <DeltaPill change={change} />
    )
  ) : null

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm/5 font-medium text-zinc-600 dark:text-zinc-300">{label}</div>
        {hero && note ? (
          <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{note}</div>
        ) : null}
      </div>
      <div
        className={`font-semibold tracking-tight tabular-nums ${accent} ${
          hero ? 'mt-3 text-4xl/10' : 'mt-1.5 text-xl/7'
        }`}
      >
        {value}
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${hero ? 'mt-3' : 'mt-1.5'}`}>
        {comparison}
      </div>
      {!hero && note ? (
        <div className="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">{note}</div>
      ) : null}
      {share !== undefined ? (
        <div
          aria-hidden="true"
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"
        >
          <div
            className="h-full rounded-full bg-red-500"
            style={{ width: `${Math.max(2, Math.round(Math.min(1, share) * 100))}%` }}
          />
        </div>
      ) : null}
    </>
  )
  const box = hero ? `${CARD} p-5` : 'bg-white px-4 py-3.5 dark:bg-zinc-900'
  const hover = hero
    ? 'transition hover:ring-zinc-950/20 dark:hover:ring-white/20'
    : 'transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60'

  return href ? (
    <Link href={href} className={`block ${box} ${hover}`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}

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
