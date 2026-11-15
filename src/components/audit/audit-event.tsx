import { ArrowRightIcon } from '@heroicons/react/16/solid'
import { Badge } from '@/components/catalyst/badge'
import { LocalTime } from '@/components/local-time'
import type { HistoryEntry } from '@/lib/audit-trail/present'

type BadgeColor = React.ComponentProps<typeof Badge>['color']

const ACTION_COLORS: Record<string, BadgeColor> = {
  create: 'green',
  update: 'zinc',
  status: 'blue',
  delete: 'red',
  restore: 'amber',
  baseline: 'zinc',
}

/**
 * One audit event: who, when, from where, what changed (before to after), and
 * the reason when one was given. Used by the History drawer and the Audit log.
 */
export function AuditEvent({ entry, showEntity = false }: { entry: HistoryEntry; showEntity?: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm/6">
        <span className="font-medium text-zinc-950 dark:text-white">{entry.actorName}</span>
        <Badge color={entry.sourceColor as BadgeColor}>{entry.sourceLabel}</Badge>
        <Badge color={ACTION_COLORS[entry.action] ?? 'zinc'}>{entry.actionLabel}</Badge>
        {showEntity || entry.isChild ? (
          <span className="text-zinc-500 dark:text-zinc-400">
            {entry.entityLabel}
            {entry.isChild ? ' (line)' : ''}
          </span>
        ) : null}
        <span className="text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400">
          <LocalTime value={entry.occurredAt} withZone />
        </span>
      </div>

      <p className="text-sm/6 text-zinc-700 dark:text-zinc-300">{entry.summary}</p>

      {entry.reason ? (
        <p className="surface-inset px-3 py-2 text-sm/6 text-zinc-700 dark:text-zinc-300">
          <span className="font-medium text-zinc-950 dark:text-white">Reason: </span>
          {entry.reason}
        </p>
      ) : null}

      {entry.changes.length > 0 && entry.action !== 'baseline' ? (
        <dl className="grid gap-1 text-sm/6">
          {entry.changes.map((change) => (
            <div
              key={change.label}
              className="grid grid-cols-1 gap-x-3 sm:grid-cols-[minmax(7rem,10rem)_1fr]"
            >
              <dt className="text-xs/6 font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                {change.label}
              </dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-2 text-zinc-950 dark:text-white">
                {change.before !== null ? (
                  <span className="break-words text-red-700 line-through decoration-red-700/40 dark:text-red-400 dark:decoration-red-400/40">
                    {change.before}
                  </span>
                ) : null}
                {change.before !== null && change.after !== null ? (
                  <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" />
                ) : null}
                {change.after !== null ? (
                  <span className="break-words text-green-700 dark:text-green-400">{change.after}</span>
                ) : null}
              </dd>
            </div>
          ))}
          {entry.moreChanges > 0 ? (
            <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">+ {entry.moreChanges} more fields</p>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}
