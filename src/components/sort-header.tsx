import { ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { Link } from '@/components/catalyst/link'
import { TableHeader } from '@/components/catalyst/table'
import { readSort } from '@/lib/table-sort'

type Params = Record<string, string | string[] | undefined>

/**
 * A column heading that sorts the table when clicked: first click ascending,
 * second descending, third back to the default order. Page, search and filter
 * parameters are kept; only the page number resets.
 */
export function SortHeader({
  column,
  label,
  params,
  pathname,
  align = 'left',
  className,
}: {
  column: string
  label: string
  params: Params
  pathname: string
  align?: 'left' | 'right'
  className?: string
}) {
  const current = readSort(params, [column])
  const next = !current ? 'asc' : current.dir === 'asc' ? 'desc' : null

  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value
    if (single !== undefined && !['sort', 'dir', 'page'].includes(key)) query.set(key, single)
  }

  if (next) {
    query.set('sort', column)
    query.set('dir', next)
  }

  const Icon = !current ? ChevronUpDownIcon : current.dir === 'asc' ? ChevronUpIcon : ChevronDownIcon

  return (
    <TableHeader
      className={clsx(align === 'right' && 'text-right', className)}
      aria-sort={!current ? 'none' : current.dir === 'asc' ? 'ascending' : 'descending'}
    >
      <Link
        href={query.toString() ? `${pathname}?${query}` : pathname}
        title={`Sort by ${label.toLowerCase()}`}
        className={clsx(
          'group relative z-10 inline-flex items-center gap-1 rounded hover:text-zinc-950 dark:hover:text-white',
          align === 'right' && 'flex-row-reverse',
          current && 'font-semibold text-zinc-950 dark:text-white',
        )}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={clsx(
            'size-3.5 transition',
            current
              ? 'text-accent-600 dark:text-accent-400'
              : 'text-zinc-300 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-300',
          )}
        />
      </Link>
    </TableHeader>
  )
}
