import { DateRangeFilter } from '@/components/date-range-filter'
import { Link } from '@/components/catalyst/link'
import type { DashboardRange } from '@/lib/dashboard-range'

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
] as const

/** Today / This week / This month, plus a custom from–to that opens inline. */
export function DashboardRangeBar({
  range,
  keep,
}: {
  range: DashboardRange
  /** Other query parameters to carry along, e.g. the outstanding filter. */
  keep: Record<string, string>
}) {
  const href = (key: string) => {
    const query = new URLSearchParams({ ...keep, range: key })

    return `/?${query}`
  }
  const pill = (active: boolean) =>
    active
      ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
      : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <nav
        aria-label="Period"
        className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5"
      >
        {PRESETS.map((preset) => (
          <Link
            key={preset.key}
            href={href(preset.key)}
            aria-current={range.key === preset.key ? 'true' : undefined}
            className={pill(range.key === preset.key)}
          >
            {preset.label}
          </Link>
        ))}
      </nav>
      <form method="get" action="/" aria-label="Custom range">
        {Object.entries(keep).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input type="hidden" name="range" value="custom" />
        <DateRangeFilter
          label=""
          autoSubmit
          placeholder="Custom range"
          defaultFrom={range.key === 'custom' ? range.fromIso : undefined}
          defaultTo={range.key === 'custom' ? range.toIso : undefined}
        />
      </form>
    </div>
  )
}
