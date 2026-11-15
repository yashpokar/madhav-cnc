import clsx from 'clsx'

/** A shimmering placeholder block. Size and shape come from className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('skeleton rounded-lg', className)} />
}

/** A short run of text lines; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={clsx('grid gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={clsx('h-3.5', index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

/** A card-shaped placeholder, for stat tiles and panels. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'surface-card p-4',
        className,
      )}
    >
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-28" />
    </div>
  )
}

/** A table-shaped placeholder: a header strip and a number of rows. */
export function SkeletonTable({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden surface-card"
    >
      <div className="border-b border-zinc-950/5 px-4 py-3 dark:border-white/5">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid items-center gap-4 border-b border-zinc-950/5 px-4 py-3.5 last:border-b-0 dark:border-white/5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className={clsx('h-3.5', col === 0 ? 'w-3/4' : 'w-1/2')} />
          ))}
        </div>
      ))}
    </div>
  )
}
