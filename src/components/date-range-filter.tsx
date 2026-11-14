'use client'

import { useRef, useState } from 'react'
import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { CalendarDaysIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function parseIso(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')

  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined
}

const short = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const full = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Common periods, Indian financial year included (1 April to 31 March). */
function presets(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const at = (year: number, month: number, day: number) => new Date(year, month, day)
  const sinceMonday = (now.getDay() + 6) % 7
  const fy = m >= 3 ? y : y - 1

  return [
    { label: 'Today', from: at(y, m, d), to: at(y, m, d) },
    { label: 'Yesterday', from: at(y, m, d - 1), to: at(y, m, d - 1) },
    { label: 'This week', from: at(y, m, d - sinceMonday), to: at(y, m, d) },
    { label: 'Last 7 days', from: at(y, m, d - 6), to: at(y, m, d) },
    { label: 'This month', from: at(y, m, 1), to: at(y, m, d) },
    { label: 'Last month', from: at(y, m - 1, 1), to: at(y, m, 0) },
    { label: 'Last 90 days', from: at(y, m, d - 89), to: at(y, m, d) },
    { label: 'This financial year', from: at(fy, 3, 1), to: at(y, m, d) },
    { label: 'Last financial year', from: at(fy - 1, 3, 1), to: at(fy, 2, 31) },
  ]
}

function describe(range: DateRange | undefined) {
  if (!range?.from) return null
  const to = range.to ?? range.from

  if (toIso(range.from) === toIso(to)) return full.format(range.from)

  return range.from.getFullYear() === to.getFullYear()
    ? `${short.format(range.from)} – ${full.format(to)}`
    : `${full.format(range.from)} – ${full.format(to)}`
}

/**
 * A from–to date filter: one field that opens a two-month calendar with
 * one-tap presets beside it. Submits `from` and `to` (yyyy-mm-dd) with the
 * surrounding GET form; leaving it empty means "any date".
 */
export function DateRangeFilter({
  defaultFrom,
  defaultTo,
  label = 'Date',
  className,
  autoSubmit = false,
  placeholder = 'Any date',
}: {
  defaultFrom?: string
  defaultTo?: string
  label?: string
  className?: string
  /** Submit the surrounding form as soon as a range is chosen. */
  autoSubmit?: boolean
  placeholder?: string
}) {
  const fromRef = useRef<HTMLInputElement>(null)
  const submit = () => {
    if (autoSubmit) setTimeout(() => fromRef.current?.form?.requestSubmit(), 0)
  }
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseIso(defaultFrom)
    const to = parseIso(defaultTo)

    return from || to ? { from: from ?? to, to: to ?? from } : undefined
  })
  const options = presets()
  const text = describe(range)
  const matches = (preset: { from: Date; to: Date }) =>
    Boolean(range?.from && toIso(range.from) === toIso(preset.from)) &&
    toIso(range?.to ?? range?.from ?? new Date(0)) === toIso(preset.to)
  const active = options.find(matches)

  return (
    <div className={clsx('min-w-0', className)}>
      <input ref={fromRef} type="hidden" name="from" value={range?.from ? toIso(range.from) : ''} />
      <input
        type="hidden"
        name="to"
        value={range?.from ? toIso(range.to ?? range.from) : ''}
      />
      <Headless.Popover className="relative">
        {({ close }) => (
          <>
            <span className="relative block">
              <Headless.PopoverButton
                className={clsx(
                  'flex h-9 w-full min-w-60 items-center gap-2 rounded-lg border bg-white px-3 pr-9 text-left text-sm/6 shadow-xs dark:bg-white/5',
                  'border-zinc-950/10 hover:border-zinc-950/20 focus:outline-2 focus:outline-gold-400 dark:border-white/10 dark:hover:border-white/20',
                )}
              >
                <CalendarDaysIcon className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">
                  {label ? <span className="mr-1.5 text-zinc-500 dark:text-zinc-400">{label}</span> : null}
                  {text ? (
                    <>
                      <span className="font-medium text-zinc-950 dark:text-white">
                        {active ? active.label : text}
                      </span>
                    </>
                  ) : (
                    <span className={label ? 'font-medium text-zinc-950 dark:text-white' : 'text-zinc-500'}>
                      {label ? 'Any' : placeholder}
                    </span>
                  )}
                </span>
              </Headless.PopoverButton>
              {text ? (
                <button
                  type="button"
                  aria-label="Clear dates"
                  onClick={() => setRange(undefined)}
                  className="absolute inset-y-0 right-2 flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <XMarkIcon className="size-4" />
                </button>
              ) : null}
            </span>

            <Headless.PopoverPanel
              transition
              anchor={{ to: 'bottom start', gap: 6, padding: 16 }}
              className="z-50 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-950/10 transition duration-100 ease-out data-closed:translate-y-1 data-closed:opacity-0 sm:flex-row dark:bg-zinc-800 dark:ring-white/10"
            >
              <ul className="flex gap-1 overflow-x-auto border-b border-zinc-950/5 p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0 dark:border-white/10">
                {options.map((preset) => (
                  <li key={preset.label}>
                    <button
                      type="button"
                      onClick={() => {
                        setRange({ from: preset.from, to: preset.to })
                        close()
                        submit()
                      }}
                      className={clsx(
                        'w-full rounded-lg px-3 py-1.5 text-left text-sm/6 whitespace-nowrap',
                        matches(preset)
                          ? 'bg-zinc-950 font-medium text-white dark:bg-white dark:text-zinc-950'
                          : 'text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/10',
                      )}
                    >
                      {preset.label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="p-3">
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={2}
                  defaultMonth={
                    range?.from
                      ? new Date(range.from.getFullYear(), range.from.getMonth(), 1)
                      : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
                  }
                  weekStartsOn={1}
                  className="date-picker"
                />
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-950/5 pt-3 dark:border-white/10">
                  <span className="text-sm/6 text-zinc-600 dark:text-zinc-300">
                    {text ?? 'Pick a start and end date'}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRange(undefined)}
                      className="rounded-lg px-3 py-1.5 text-sm/6 font-medium text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        submit()
                      }}
                      className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm/6 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      Done
                    </button>
                  </span>
                </div>
              </div>
            </Headless.PopoverPanel>
          </>
        )}
      </Headless.Popover>
    </div>
  )
}
