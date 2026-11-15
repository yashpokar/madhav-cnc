import clsx from 'clsx'
import { Link } from '@/components/catalyst/link'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

// Tone colours only the icon tile and the value, never the whole card.
const TILE: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300',
  good: 'bg-lime-100 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  bad: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300',
}

const VALUE: Record<Tone, string> = {
  neutral: 'text-zinc-950 dark:text-white',
  good: 'text-lime-700 dark:text-lime-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
}

/**
 * A single figure on its own raised card: muted label, big tabular value, an
 * optional sub-label or delta chip, an optional icon in a soft tile, and an
 * optional href that makes the whole card a link. Cards in a grid share a
 * height (h-full), so a row of them lines up.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = 'neutral',
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  /** A small chip beside the value, e.g. "12% vs last month". */
  delta?: React.ReactNode
  icon?: React.ReactNode
  tone?: Tone
  href?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">{label}</div>
        {icon ? (
          <span
            aria-hidden="true"
            className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5', TILE[tone])}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div className={clsx('text-2xl/8 font-semibold tracking-tight tabular-nums sm:text-3xl/9', VALUE[tone])}>
          {value}
        </div>
        {delta ? <div className="text-xs/5 font-medium">{delta}</div> : null}
      </div>
      {hint ? <div className="mt-1.5 text-xs/5 text-zinc-500 dark:text-zinc-400">{hint}</div> : null}
    </>
  )
  const base = clsx('block h-full p-4 sm:p-5', className)

  return href ? (
    <Link href={href} className={clsx(base, 'surface-card surface-card-interactive')}>
      {body}
    </Link>
  ) : (
    <div className={clsx(base, 'surface-card')}>{body}</div>
  )
}
