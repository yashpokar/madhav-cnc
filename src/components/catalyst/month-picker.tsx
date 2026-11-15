'use client'

import {
  currentYearMonth,
  formatYearMonth,
  isYearMonth,
  monthShortNames,
  stepYear,
} from '@/lib/date-input'
import * as Headless from '@headlessui/react'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { useState } from 'react'

type MonthChangeEvent = { target: { name: string; value: string } }

/**
 * A themed month field that stands in for <input type="month">: a year
 * stepper over a 4 by 3 grid of months. The value is 'yyyy-mm', also
 * submitted through a hidden input named `name`.
 */
export function MonthPicker({
  className,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  invalid,
  min,
  max,
  placeholder = 'Pick a month',
  'aria-label': ariaLabel,
}: {
  className?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (event: MonthChangeEvent) => void
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  min?: string
  max?: string
  placeholder?: string
  'aria-label'?: string
}) {
  const controlled = value !== undefined
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = controlled ? value : inner
  const selected = isYearMonth(current) ? current : null
  const thisMonth = currentYearMonth()
  const minMonth = isYearMonth(min) ? min : undefined
  const maxMonth = isYearMonth(max) ? max : undefined

  function commit(next: string, close?: () => void) {
    if (!controlled) setInner(next)
    if (next !== current) onChange?.({ target: { name: name ?? '', value: next } })
    close?.()
  }

  const blocked = (month: string) =>
    Boolean((minMonth && month < minMonth) || (maxMonth && month > maxMonth))

  return (
    <Headless.Popover data-slot="control" className={clsx(className, 'relative block w-full')}>
      {({ close }) => (
        <>
          {name ? <input type="hidden" name={name} value={current} required={required} /> : null}
          <span
            data-invalid={invalid ? '' : undefined}
            className={clsx(
              'group relative block w-full',
              'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
              'dark:before:hidden',
              'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset has-data-focus:after:ring-2 has-data-focus:after:ring-accent-500',
              disabled && 'opacity-50 before:bg-zinc-950/5 before:shadow-none',
            )}
          >
            <Headless.PopoverButton
              disabled={disabled}
              aria-label={ariaLabel}
              className={clsx(
                'relative flex h-10 w-full appearance-none items-center gap-2 rounded-lg border bg-transparent px-3 text-left text-base/6 focus:outline-hidden sm:text-sm/6 dark:bg-white/5',
                invalid
                  ? 'border-red-500 dark:border-red-600'
                  : 'border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20',
                selected ? 'text-zinc-950 dark:text-white' : 'text-zinc-400',
              )}
            >
              <CalendarDaysIcon className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
              <span className="min-w-0 flex-1 truncate">
                {selected ? formatYearMonth(selected) : placeholder}
              </span>
            </Headless.PopoverButton>
          </span>

          <Headless.PopoverPanel
            transition
            focus
            anchor={{ to: 'bottom start', gap: 4, padding: 16 }}
            className="z-50 w-[min(calc(100vw-2rem),17rem)] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-zinc-950/10 transition duration-100 ease-out data-closed:translate-y-1 data-closed:opacity-0 dark:bg-zinc-800 dark:ring-white/10"
          >
            <MonthGrid
              initial={selected ?? thisMonth}
              selected={selected}
              thisMonth={thisMonth}
              blocked={blocked}
              onPick={(month) => commit(month, close)}
            />
            <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-950/5 pt-3 dark:border-white/10">
              <button
                type="button"
                disabled={blocked(thisMonth)}
                onClick={() => commit(thisMonth, close)}
                className="rounded-full px-3 py-1 text-xs/5 font-medium text-zinc-700 ring-1 ring-zinc-950/10 ring-inset hover:bg-zinc-950/5 disabled:opacity-40 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/10"
              >
                This month
              </button>
            </div>
          </Headless.PopoverPanel>
        </>
      )}
    </Headless.Popover>
  )
}

function MonthGrid({
  initial,
  selected,
  thisMonth,
  blocked,
  onPick,
}: {
  initial: string
  selected: string | null
  thisMonth: string
  blocked: (month: string) => boolean
  onPick: (month: string) => void
}) {
  const [year, setYear] = useState(initial.slice(0, 4))
  const stepper =
    'flex size-8 items-center justify-center rounded-full text-zinc-600 hover:bg-accent-50 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10'

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous year"
          className={stepper}
          onClick={() => setYear(stepYear(`${year}-01`, -1).slice(0, 4))}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm/6 font-semibold tabular-nums" aria-live="polite">
          {year}
        </span>
        <button
          type="button"
          aria-label="Next year"
          className={stepper}
          onClick={() => setYear(stepYear(`${year}-01`, 1).slice(0, 4))}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div role="group" aria-label={`Months of ${year}`} className="mt-2 grid grid-cols-4 gap-1">
        {monthShortNames.map((label, index) => {
          const month = `${year}-${String(index + 1).padStart(2, '0')}`
          const isSelected = month === selected

          return (
            <button
              key={month}
              type="button"
              disabled={blocked(month)}
              aria-pressed={isSelected}
              aria-current={month === thisMonth ? 'date' : undefined}
              onClick={() => onPick(month)}
              className={clsx(
                'h-10 rounded-lg text-sm/6 font-medium disabled:opacity-40',
                isSelected
                  ? 'bg-accent-600 text-white'
                  : month === thisMonth
                    ? 'text-accent-700 ring-1 ring-accent-300 ring-inset hover:bg-accent-50 dark:text-accent-300 dark:ring-accent-500/50 dark:hover:bg-white/10'
                    : 'text-zinc-800 hover:bg-zinc-950/5 dark:text-zinc-100 dark:hover:bg-white/10',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
