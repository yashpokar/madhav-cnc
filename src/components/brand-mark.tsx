import clsx from 'clsx'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={clsx('size-8 shrink-0', className)}
    >
      <rect width="32" height="32" rx="7" className="fill-zinc-950 dark:fill-white" />
      <path
        d="M8.5 22V10.5l4.2 6.2 4.2-6.2V22"
        className="stroke-white dark:stroke-zinc-950"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="22.5"
        cy="19.5"
        r="2.6"
        className="stroke-white dark:stroke-zinc-950"
        strokeWidth="2.1"
      />
    </svg>
  )
}

export function BrandLockup({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="min-w-0">
        <div className="truncate text-sm/5 font-semibold text-zinc-950 dark:text-white">
          Madhav CNC
        </div>
        {subtitle ? (
          <div className="truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  )
}
