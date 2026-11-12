export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid animate-pulse grid-cols-1 gap-5 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <div className="h-6 w-48 rounded bg-zinc-950/10 dark:bg-white/10" />
        <div className="h-4 w-32 rounded bg-zinc-950/5 dark:bg-white/5" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 rounded-lg bg-zinc-950/5 dark:bg-white/5"
          />
        ))}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-10 rounded-lg bg-zinc-950/5 dark:bg-white/5"
          />
        ))}
      </div>
    </div>
  )
}
