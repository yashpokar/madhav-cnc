import { Badge } from '@/components/catalyst/badge'
import { Link } from '@/components/catalyst/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { RELATED_LIMIT } from '@/lib/queries/related'

export const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function fmtDate(value: Date | null | undefined) {
  return value ? dateFormat.format(value) : '—'
}

type Tone = React.ComponentProps<typeof Badge>['color']

export function StatusBadge({
  label,
  color,
}: {
  label: string
  color: Tone
}) {
  return <Badge color={color}>{label}</Badge>
}

export type RelatedColumn = { label: string; align?: 'right' }

export type RelatedRow = {
  key: string
  href: string
  cells: React.ReactNode[]
}

/**
 * A compact, linked table of records related to the one being viewed. Shows the
 * total count, the newest rows and, when given, a link to the full list.
 */
export function RelatedTable({
  title,
  count,
  columns,
  rows,
  empty,
  allHref,
}: {
  title: string
  count: number
  columns: RelatedColumn[]
  rows: RelatedRow[]
  empty: string
  allHref?: string
}) {
  const headingId = `related-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <section aria-labelledby={headingId} className="grid grid-cols-1 gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id={headingId}
          className="text-sm/6 font-semibold text-zinc-950 dark:text-white"
        >
          {title}{' '}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            ({count})
          </span>
        </h2>
        {allHref && count > rows.length ? (
          <Link
            href={allHref}
            className="text-xs/5 font-medium text-zinc-600 underline decoration-zinc-950/20 underline-offset-2 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
          >
            View all {count}
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-950/15 px-3 py-4 text-sm/6 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          {empty}
        </p>
      ) : (
        <>
          <Table dense>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableHeader
                    key={column.label}
                    className={column.align === 'right' ? 'text-right' : undefined}
                  >
                    {column.label}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.key}
                  href={row.href}
                  title={`Open ${String(row.cells[0])}`}
                >
                  {row.cells.map((cell, index) => (
                    <TableCell
                      key={index}
                      className={
                        columns[index]?.align === 'right'
                          ? 'text-right tabular-nums'
                          : index === 0
                            ? 'font-medium'
                            : undefined
                      }
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {count > rows.length ? (
            <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
              Showing the latest {RELATED_LIMIT} of {count}.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
