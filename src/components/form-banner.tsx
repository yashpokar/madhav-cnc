export function FormBanner({
  tone,
  children,
}: {
  tone: 'success' | 'error'
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={
        tone === 'success'
          ? 'rounded-lg bg-lime-50 px-4 py-3 text-sm/6 text-lime-900 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:text-lime-200 dark:ring-lime-400/20'
          : 'rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-900 ring-1 ring-red-950/10 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/20'
      }
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-950/15 px-6 py-12 text-center dark:border-white/15">
      <div className="text-sm/6 font-medium text-zinc-950 dark:text-white">
        {title}
      </div>
      <div className="mx-auto mt-1 max-w-sm text-sm/6 text-zinc-500 dark:text-zinc-400">
        {description}
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
