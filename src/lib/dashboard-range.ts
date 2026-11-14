type Params = Record<string, string | string[] | undefined>

export type RangeKey = 'today' | 'week' | 'month' | 'custom'

const DAY = 86_400_000
const ISO = /^\d{4}-\d{2}-\d{2}$/

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/** Today's date in India, as a UTC-midnight Date (dates are stored without a time). */
export function todayInIndia(now = new Date()) {
  const text = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  return new Date(`${text}T00:00:00Z`)
}

export const toIso = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

const short = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const full = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * The period the dashboard is showing: today, this week (Monday to today),
 * this month (1st to today), or a custom from–to. `prev` is the equally long
 * stretch just before it, for "vs before" comparisons.
 */
export function readDashboardRange(params: Params, now = new Date()) {
  const today = todayInIndia(now)
  const asked = first(params.range)
  const key: RangeKey =
    asked === 'week' || asked === 'month' || asked === 'custom' ? asked : 'today'

  let from = today
  let to = today

  if (key === 'week') {
    const sinceMonday = (today.getUTCDay() + 6) % 7
    from = addDays(today, -sinceMonday)
  } else if (key === 'month') {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  } else if (key === 'custom') {
    const f = first(params.from)
    const t = first(params.to)
    const start = f && ISO.test(f) ? new Date(`${f}T00:00:00Z`) : undefined
    const end = t && ISO.test(t) ? new Date(`${t}T00:00:00Z`) : undefined

    from = start ?? end ?? today
    to = end ?? start ?? today

    if (from > to) [from, to] = [to, from]
    if (to.getTime() - from.getTime() > 365 * DAY) from = addDays(to, -365)
  }

  const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(days - 1))

  const label =
    key === 'today'
      ? 'Today'
      : key === 'week'
        ? 'This week'
        : key === 'month'
          ? 'This month'
          : days === 1
            ? full.format(from)
            : `${short.format(from)} – ${full.format(to)}`

  const compareLabel =
    key === 'today'
      ? 'yesterday'
      : key === 'week'
        ? 'last week so far'
        : key === 'month'
          ? 'last month so far'
          : 'the period before'

  return {
    key,
    label,
    compareLabel,
    from,
    to,
    days,
    fromIso: toIso(from),
    toIso: toIso(to),
    prev: { from: prevFrom, to: prevTo, fromIso: toIso(prevFrom), toIso: toIso(prevTo) },
  }
}

export type DashboardRange = ReturnType<typeof readDashboardRange>
