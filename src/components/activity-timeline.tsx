import { ChevronRightIcon } from '@heroicons/react/16/solid'
import { LocalTime } from '@/components/local-time'
import { listActivity, type ActivityEntity } from '@/lib/activity'

/** Who did what to this record, newest first. Hidden when printing. */
export async function ActivityTimeline({
  entity,
  id,
}: {
  entity: ActivityEntity
  id: string
}) {
  const items = await listActivity(entity, id)

  const latest = items[0]

  return (
    <details
      // A long history starts folded away; a short one is worth seeing at once.
      open={items.length <= 3}
      className="group grid gap-2 print:hidden"
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 text-sm/6 select-none marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90 dark:text-zinc-400"
        />
        <h2 className="font-semibold text-zinc-950 dark:text-white">
          Activity{' '}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">({items.length})</span>
        </h2>
        {latest ? (
          <span className="min-w-0 truncate text-zinc-500 group-open:hidden dark:text-zinc-400">
            · {latest.userName ?? 'Someone'} {latest.summary}
          </span>
        ) : null}
      </summary>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-950/15 px-3 py-4 text-sm/6 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          Nothing recorded yet. Changes from now on will appear here.
        </p>
      ) : (
        <ol className="ml-2 grid gap-0 border-l border-zinc-950/10 pl-4 dark:border-white/10">
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
              <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                <LocalTime value={item.createdAt} withZone />
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}
