import clsx from 'clsx'

/**
 * The Prodlys mark: a rounded tile holding a "p" whose bowl rises like a
 * progress arc. The tile follows the accent colour, so a company accent swap
 * re-colours it. The static copy for favicons lives in src/app/icon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={clsx('size-8 shrink-0', className)}
    >
      <rect width="32" height="32" rx="9" className="fill-accent-600" />
      <path
        d="M12 24.5V8.5h4.6a5.2 5.2 0 0 1 0 10.4H12"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Lowercase wordmark; kept neutral so it suits any industry. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'font-semibold tracking-tight text-zinc-950 dark:text-white',
        className,
      )}
    >
      prodlys
    </span>
  )
}

export function BrandLockup({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="min-w-0">
        <Wordmark className="block truncate text-base/5" />
        {subtitle ? (
          <div className="truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  )
}
