import { listActivity, type ActivityEntity } from '@/lib/activity'

const stamp = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

/** Who did what to this record, newest first. Hidden when printing. */
export async function ActivityTimeline({
  entity,
  id,
}: {
  entity: ActivityEntity
  id: string
}) {
  const items = await listActivity(entity, id)

  return (
    <section aria-labelledby={`activity-${entity}`} className="grid gap-2 print:hidden">
      <h2
        id={`activity-${entity}`}
        className="text-sm/6 font-semibold text-zinc-950 dark:text-white"
      >
        Activity{' '}
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          ({items.length})
        </span>
      </h2>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-950/15 px-3 py-4 text-sm/6 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          Nothing recorded yet. Changes from now on will appear here.
        </p>
      ) : (
        <ol className="grid gap-0 border-l border-zinc-950/10 pl-4 dark:border-white/10">
          {items.map((item) => (
            <li key={item.id} className="relative pb-3 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute top-2 -left-[1.3125rem] size-2 rounded-full bg-zinc-950 ring-4 ring-white dark:bg-white dark:ring-zinc-900"
              />
              <p className="text-sm/6 text-zinc-950 dark:text-white">
                <span className="font-medium">{item.userName ?? 'Someone'}</span>{' '}
                {item.summary}
              </p>
              <time
                dateTime={item.createdAt.toISOString()}
                className="text-xs/5 text-zinc-500 dark:text-zinc-400"
              >
                {stamp.format(item.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
