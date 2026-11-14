'use client'

import { useId, useState } from 'react'
import clsx from 'clsx'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** A round step for the slider: about 1% of the scale, never below ₹1. */
function stepFor(ceiling: number) {
  return Math.max(1, 10 ** (Math.floor(Math.log10(Math.max(ceiling, 1))) - 2))
}

const THUMB = [
  'pointer-events-none absolute inset-x-0 top-0 h-5 w-full appearance-none bg-transparent focus:outline-hidden',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm active:[&::-webkit-slider-thumb]:cursor-grabbing',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:bg-white',
  'focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-blue-500/30',
].join(' ')

/**
 * A two-handle amount range. The handles snap to a sensible step, the two
 * boxes allow an exact figure, and only a narrowed end is submitted (as
 * `min` / `max`), so leaving a handle at its end means "no limit".
 */
export function RangeSlider({
  label,
  ceiling,
  defaultMin,
  defaultMax,
  className,
}: {
  label: string
  /** The largest amount in the list, which is the slider's right end. */
  ceiling: number
  defaultMin?: number
  defaultMax?: number
  className?: string
}) {
  const id = useId()
  const step = stepFor(ceiling)
  const top = Math.max(step, Math.ceil(ceiling / step) * step)
  const [low, setLow] = useState(Math.min(defaultMin ?? 0, top))
  const [high, setHigh] = useState(Math.min(defaultMax ?? top, top))

  const clamp = (value: number) => Math.min(Math.max(value, 0), top)
  const pct = (value: number) => (value / top) * 100

  return (
    <fieldset className={clsx('grid gap-2 text-xs/5 text-zinc-500 dark:text-zinc-400', className)}>
      <legend className="mb-1 flex w-full items-baseline justify-between gap-3">
        <span>{label}</span>
        <span className="font-medium text-zinc-950 tabular-nums dark:text-white">
          {inr.format(low)} – {high >= top ? `${inr.format(top)}+` : inr.format(high)}
        </span>
      </legend>

      <div className="relative mx-2 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-950/10 dark:bg-white/15" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        <input
          type="range"
          aria-label={`Minimum ${label.toLowerCase()}`}
          min={0}
          max={top}
          step={step}
          value={low}
          onChange={(event) => setLow(Math.min(Number(event.target.value), high))}
          className={THUMB}
        />
        <input
          type="range"
          aria-label={`Maximum ${label.toLowerCase()}`}
          min={0}
          max={top}
          step={step}
          value={high}
          onChange={(event) => setHigh(Math.max(Number(event.target.value), low))}
          className={THUMB}
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-min`} className="sr-only">
          Minimum {label.toLowerCase()} (₹)
        </label>
        <input
          id={`${id}-min`}
          type="number"
          inputMode="decimal"
          min={0}
          max={top}
          value={low}
          onChange={(event) => setLow(Math.min(clamp(Number(event.target.value) || 0), high))}
          className="w-full min-w-0 rounded-lg border border-zinc-950/10 bg-transparent px-2.5 py-1 text-sm/6 text-zinc-950 tabular-nums focus:border-blue-500 focus:outline-hidden dark:border-white/10 dark:text-white"
        />
        <span aria-hidden="true">to</span>
        <label htmlFor={`${id}-max`} className="sr-only">
          Maximum {label.toLowerCase()} (₹)
        </label>
        <input
          id={`${id}-max`}
          type="number"
          inputMode="decimal"
          min={0}
          value={high}
          onChange={(event) =>
            setHigh(Math.max(Number(event.target.value) || 0, low))
          }
          className="w-full min-w-0 rounded-lg border border-zinc-950/10 bg-transparent px-2.5 py-1 text-sm/6 text-zinc-950 tabular-nums focus:border-blue-500 focus:outline-hidden dark:border-white/10 dark:text-white"
        />
      </div>

      {low > 0 ? <input type="hidden" name="min" value={low} /> : null}
      {high < top ? <input type="hidden" name="max" value={high} /> : null}
    </fieldset>
  )
}
