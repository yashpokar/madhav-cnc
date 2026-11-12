import { Link } from '@/components/catalyst/link'

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

export function StatTile({
  href,
  label,
  value,
  hint,
  tone = 'default',
}: {
  href: string
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'default' | 'warn' | 'good'
}) {
  const accent =
    tone === 'warn'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'good'
        ? 'text-lime-700 dark:text-lime-400'
        : 'text-zinc-950 dark:text-white'

  return (
    <Link
      href={href}
      className="group block rounded-lg p-3 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:ring-white/10 dark:hover:bg-white/5"
    >
      <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`text-xl/8 font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
      {hint ? (
        <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{hint}</div>
      ) : null}
    </Link>
  )
}

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
    <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      <header className="flex items-center justify-between gap-3 px-3 pt-3">
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
        <p className="px-3 py-4 text-sm/6 text-zinc-500 dark:text-zinc-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-zinc-950/5 pb-1 dark:divide-white/5">
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
        className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
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
