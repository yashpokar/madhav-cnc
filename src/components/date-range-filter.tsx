'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { DatePicker } from '@/components/catalyst/date-picker'

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Indian financial year: 1 April to 31 March. */
function presets(now = new Date()) {
  const year = now.getFullYear()
  const fyStart = now.getMonth() >= 3 ? year : year - 1
  const daysAgo = (days: number) => new Date(year, now.getMonth(), now.getDate() - days)

  return [
    { key: 'month', label: 'This month', from: new Date(year, now.getMonth(), 1), to: now },
    {
      key: 'last-month',
      label: 'Last month',
      from: new Date(year, now.getMonth() - 1, 1),
      to: new Date(year, now.getMonth(), 0),
    },
    { key: '30', label: 'Last 30 days', from: daysAgo(30), to: now },
    { key: '90', label: 'Last 90 days', from: daysAgo(90), to: now },
    { key: 'fy', label: 'This financial year', from: new Date(fyStart, 3, 1), to: now },
  ].map((preset) => ({ ...preset, from: iso(preset.from), to: iso(preset.to) }))
}

/**
 * A from–to date filter with one-tap presets. Submits `from` and `to` (ISO
 * dates) with the surrounding GET form; either end can be left open.
 */
export function DateRangeFilter({
  defaultFrom,
  defaultTo,
  label = 'Date range',
  className,
}: {
  defaultFrom?: string
  defaultTo?: string
  label?: string
  className?: string
}) {
  const [from, setFrom] = useState(defaultFrom ?? '')
  const [to, setTo] = useState(defaultTo ?? '')
  const options = presets()

  return (
    <fieldset className={clsx('grid gap-2 text-xs/5 text-zinc-500 dark:text-zinc-400', className)}>
      <legend className="mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((preset) => {
          const active = from === preset.from && to === preset.to

          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFrom(preset.from)
                setTo(preset.to)
              }}
              className={clsx(
                'rounded-full px-2.5 py-0.5 text-xs/5 font-medium ring-1 transition ring-inset',
                active
                  ? 'bg-blue-600 text-white ring-blue-600'
                  : 'text-zinc-700 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/5',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <DatePicker
          name="from"
          value={from}
          max={to || undefined}
          placeholder="From"
          aria-label="From date"
          onChange={(event) => setFrom(event.target.value)}
        />
        <span aria-hidden="true">to</span>
        <DatePicker
          name="to"
          value={to}
          min={from || undefined}
          placeholder="To"
          aria-label="To date"
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
    </fieldset>
  )
}
