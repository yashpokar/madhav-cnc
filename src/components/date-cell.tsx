const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const DAY = 24 * 60 * 60 * 1000

/**
 * Two stacked lines for a record with a due date: the date itself, then
 * "Due 19 Nov 2026" in smaller text. When `open` is true and the due date has
 * passed, the second line turns red and counts the days late.
 */
export function DateCell({
  date,
  dueDate,
  open = false,
}: {
  date: Date
  dueDate?: Date | null
  /** Whether the record is still waiting on the due date (not done or cancelled). */
  open?: boolean
}) {
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const late = dueDate ? Math.floor((today - dueDate.getTime()) / DAY) : 0

  return (
    <>
      <div className="text-sm/5 font-medium tabular-nums text-zinc-950 dark:text-white">
        {dateFormat.format(date)}
      </div>
      {dueDate ? (
        open && late > 0 ? (
          <div className="text-xs/5 font-medium tabular-nums text-red-600">
            Due {dateFormat.format(dueDate)} · {late}d late
          </div>
        ) : (
          <div className="text-xs/5 tabular-nums text-zinc-600 dark:text-zinc-300">
            Due {dateFormat.format(dueDate)}
          </div>
        )
      ) : null}
    </>
  )
}
