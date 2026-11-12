export function DangerZone({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label="Delete"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-950/10 p-4 dark:border-red-400/20"
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="text-sm/6 font-medium text-zinc-950 dark:text-white">
          {title}
        </div>
        <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
          {description}
        </div>
      </div>
      {children}
    </section>
  )
}
