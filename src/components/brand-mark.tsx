import clsx from 'clsx'
import {
  MARK_PATH,
  MARK_STROKE_WIDTH,
  MARK_TILE_RADIUS,
  MARK_VIEWBOX,
} from '@/lib/brand'

/**
 * The Prodlys mark: a rounded tile holding a "p" whose bowl rises like a
 * progress arc. The tile follows the accent colour, so a company accent swap
 * re-colours it. The static copy for favicons lives in src/app/icon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      aria-hidden="true"
      className={clsx('size-8 shrink-0', className)}
    >
      <rect
        width="32"
        height="32"
        rx={MARK_TILE_RADIUS}
        className="fill-accent-600"
      />
      <path
        d={MARK_PATH}
        stroke="#fff"
        strokeWidth={MARK_STROKE_WIDTH}
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
