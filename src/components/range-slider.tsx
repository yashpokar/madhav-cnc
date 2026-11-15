'use client'

import { moneyWhole as inr } from '@/lib/format'
import { useRef, useState } from 'react'
import * as Headless from '@headlessui/react'
import { NumericInput } from '@/components/numeric-input'
import clsx from 'clsx'
import { BanknotesIcon, XMarkIcon } from '@heroicons/react/16/solid'

/** A round step for the slider: about 1% of the scale, never below ₹1. */
function stepFor(ceiling: number) {
  return Math.max(1, 10 ** (Math.floor(Math.log10(Math.max(ceiling, 1))) - 2))
}

const THUMB = [
  'pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent focus:outline-hidden',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-950 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md dark:[&::-webkit-slider-thumb]:border-white dark:[&::-webkit-slider-thumb]:bg-zinc-900',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-zinc-950 [&::-moz-range-thumb]:bg-white',
  'focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-accent-400/40',
].join(' ')

const box =
  'w-full min-w-0 rounded-lg border border-zinc-950/10 bg-white py-1.5 pr-2.5 pl-6 text-sm/6 text-zinc-950 tabular-nums focus:border-zinc-950/30 focus:outline-2 focus:outline-accent-400 dark:border-white/10 dark:bg-white/5 dark:text-white'

/**
 * An amount filter that matches the date-range filter: one field showing the
 * chosen range, opening a panel with a two-handle slider and exact boxes.
 * Only a narrowed end is submitted (as `min` / `max`), so a handle left at its
 * end means "no limit".
 */
export function RangeSlider({
  label,
  ceiling,
  defaultMin,
  defaultMax,
  className,
  autoSubmit = false,
}: {
  label: string
  /** The largest amount in the list, which is the slider's right end. */
  ceiling: number
  defaultMin?: number
  defaultMax?: number
  className?: string
  /** Submit the surrounding form when the range is set or cleared. */
  autoSubmit?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const submit = () => {
    if (autoSubmit) setTimeout(() => root.current?.closest('form')?.requestSubmit(), 0)
  }
  const step = stepFor(ceiling)
  const top = Math.max(step, Math.ceil(ceiling / step) * step)
  const [low, setLow] = useState(Math.min(defaultMin ?? 0, top))
  const [high, setHigh] = useState(Math.min(defaultMax ?? top, top))

  const narrowed = low > 0 || high < top
  const pct = (value: number) => (value / top) * 100
  const summary = !narrowed
    ? null
    : low > 0 && high < top
      ? `${inr.format(low)} – ${inr.format(high)}`
      : low > 0
        ? `${inr.format(low)} or more`
        : `Up to ${inr.format(high)}`
  const reset = () => {
    setLow(0)
    setHigh(top)
    submit()
  }

  return (
    <div ref={root} className={clsx('min-w-0', className)}>
      {low > 0 ? <input type="hidden" name="min" value={low} /> : null}
      {high < top ? <input type="hidden" name="max" value={high} /> : null}
      <Headless.Popover className="relative">
        {({ close }) => (
          <>
            <span className="relative block">
              <Headless.PopoverButton
                className={clsx(
                  'flex h-9 w-full min-w-56 items-center gap-2 rounded-lg border bg-white px-3 pr-9 text-left text-sm/6 shadow-xs dark:bg-white/5',
                  'border-zinc-950/10 hover:border-zinc-950/20 focus:outline-2 focus:outline-accent-400 dark:border-white/10 dark:hover:border-white/20',
                )}
              >
                <BanknotesIcon className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                  <span className="ml-1.5 font-medium text-zinc-950 dark:text-white">
                    {summary ?? 'Any'}
                  </span>
                </span>
              </Headless.PopoverButton>
              {narrowed ? (
                <button
                  type="button"
                  aria-label={`Clear ${label.toLowerCase()}`}
                  onClick={reset}
                  className="absolute inset-y-0 right-2 flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <XMarkIcon className="size-4" />
                </button>
              ) : null}
            </span>

            <Headless.PopoverPanel
              transition
              anchor={{ to: 'bottom start', gap: 6, padding: 16 }}
              className="z-50 w-[min(92vw,22rem)] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-950/10 transition duration-100 ease-out data-closed:translate-y-1 data-closed:opacity-0 dark:bg-zinc-800 dark:ring-white/10"
            >
              <div className="flex items-baseline justify-between text-sm/6">
                <span className="font-medium">{label}</span>
                <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                  {inr.format(low)} – {high >= top ? `${inr.format(top)}+` : inr.format(high)}
                </span>
              </div>

              <div className="relative mx-2.5 mt-4 h-6">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-950/10 dark:bg-white/15" />
                <div
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-950 dark:bg-white"
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

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                  From
                  <span className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-zinc-400">₹</span>
                    <NumericInput
                      inputMode="decimal"
                      min={0}
                      max={top}
                      value={low}
                      onChange={(event) =>
                        setLow(Math.min(Math.max(Number(event.target.value) || 0, 0), high))
                      }
                      className={box}
                    />
                  </span>
                </label>
                <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                  To
                  <span className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-zinc-400">₹</span>
                    <NumericInput
                      inputMode="decimal"
                      min={0}
                      value={high}
                      onChange={(event) => setHigh(Math.max(Number(event.target.value) || 0, low))}
                      className={box}
                    />
                  </span>
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-zinc-950/5 pt-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg px-3 py-1.5 text-sm/6 font-medium text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    if (narrowed) submit()
                  }}
                  className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm/6 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  Done
                </button>
              </div>
            </Headless.PopoverPanel>
          </>
        )}
      </Headless.Popover>
    </div>
  )
}
