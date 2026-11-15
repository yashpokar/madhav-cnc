'use client'

import {
  formatTime12,
  isTimeValue,
  nearestSlot,
  parseTypedTime,
  timeSlots,
} from '@/lib/date-input'
import * as Headless from '@headlessui/react'
import { ClockIcon, XMarkIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { useMemo, useState } from 'react'

type TimeChangeEvent = { target: { name: string; value: string } }

const SLOTS = timeSlots(15)

/**
 * A themed time field that stands in for <input type="time">. Pick a
 * 15-minute slot from the list, or type a time ('3pm', '3:30 pm', '15:30',
 * '0930'). Times show as 12-hour like the rest of the app and are submitted
 * as 24-hour 'HH:mm' through a hidden input named `name`.
 */
export function TimePicker({
  className,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  invalid,
  placeholder = 'e.g. 3:30 pm',
  'aria-label': ariaLabel,
}: {
  className?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (event: TimeChangeEvent) => void
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  'aria-label'?: string
}) {
  const controlled = value !== undefined
  const [inner, setInner] = useState(defaultValue ?? '')
  const [query, setQuery] = useState('')
  const current = controlled ? value : inner
  const selected = isTimeValue(current) ? current : null
  const parsedQuery = query.trim() ? parseTypedTime(query) : null
  const typedInvalid = query.trim() !== '' && !parsedQuery

  const options = useMemo(() => {
    const text = query.trim().toLowerCase().replace(/\s+/g, '')

    if (!text) return SLOTS

    const matches = SLOTS.filter((slot) => formatTime12(slot).replace(' ', '').startsWith(text))
    const list = matches.length > 0 ? matches : SLOTS.filter((slot) => slot.replace(':', '').startsWith(text))

    // A typed time that is not on the 15-minute grid (like 9:07) is still offered.
    return parsedQuery && !list.includes(parsedQuery) ? [parsedQuery, ...list] : list
  }, [query, parsedQuery])

  function commit(next: string) {
    if (!controlled) setInner(next)
    if (next !== current) onChange?.({ target: { name: name ?? '', value: next } })
  }

  function commitQuery() {
    const text = query.trim()

    setQuery('')

    if (text === '') return

    if (parsedQuery) commit(parsedQuery)
  }

  return (
    <Headless.Combobox<string | null>
      value={selected}
      disabled={disabled}
      immediate
      onChange={(next) => {
        setQuery('')
        commit(next ?? '')
      }}
      onClose={() => setQuery('')}
    >
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <span
        data-slot="control"
        data-invalid={invalid || typedInvalid ? '' : undefined}
        className={clsx(
          className,
          'group relative block w-full',
          'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
          'dark:before:hidden',
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset focus-within:after:ring-2 focus-within:after:ring-accent-500 has-data-invalid:focus-within:after:ring-red-500',
          disabled && 'opacity-50 before:bg-zinc-950/5 before:shadow-none',
        )}
      >
        <Headless.ComboboxInput
          aria-label={ariaLabel}
          aria-invalid={invalid || typedInvalid ? true : undefined}
          autoComplete="off"
          placeholder={placeholder}
          required={required}
          displayValue={(slot: string | null) => (slot ? formatTime12(slot) : '')}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={commitQuery}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && parsedQuery && !options.includes(parsedQuery)) {
              event.preventDefault()
              commitQuery()
            }
          }}
          className={clsx(
            'relative block h-10 w-full appearance-none rounded-lg border bg-transparent py-0 pr-[4.25rem] pl-3 text-base/6 text-zinc-950 placeholder:text-zinc-400 focus:outline-hidden sm:text-sm/6 dark:bg-white/5 dark:text-white',
            invalid || typedInvalid
              ? 'border-red-500 dark:border-red-600'
              : 'border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20',
            'disabled:border-zinc-950/20 dark:disabled:border-white/15',
          )}
        />
        <span className="absolute inset-y-0 right-1 z-10 flex items-center gap-0.5">
          {selected && !required && !disabled ? (
            <button
              type="button"
              aria-label="Clear time"
              onClick={() => {
                setQuery('')
                commit('')
              }}
              className="flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            >
              <XMarkIcon className="size-4" />
            </button>
          ) : null}
          <Headless.ComboboxButton
            aria-label="Show times"
            className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-800 data-open:bg-accent-50 data-open:text-accent-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            <ClockIcon className="size-4" />
          </Headless.ComboboxButton>
        </span>
      </span>
      {typedInvalid ? (
        <span role="alert" className="sr-only">
          Not a valid time. Try 3pm or 15:30.
        </span>
      ) : null}

      <Headless.ComboboxOptions
        transition
        anchor={{ to: 'bottom start', gap: 4, padding: 16 }}
        className="z-50 max-h-64 w-(--input-width) min-w-40 scroll-py-1 overflow-y-auto overscroll-contain rounded-xl bg-white p-1 shadow-xl ring-1 ring-zinc-950/10 transition duration-100 ease-out empty:invisible data-closed:opacity-0 dark:bg-zinc-800 dark:ring-white/10"
      >
        {options.map((slot) => (
          <Headless.ComboboxOption
            key={slot}
            value={slot}
            ref={
              slot === (selected ? nearestSlot(selected) : null)
                ? (node: HTMLElement | null) => node?.scrollIntoView?.({ block: 'center' })
                : undefined
            }
            className="group flex cursor-default items-center rounded-lg px-3 py-2 text-sm/5 text-zinc-950 tabular-nums select-none data-focus:bg-accent-600 data-focus:text-white data-selected:font-semibold dark:text-white"
          >
            {formatTime12(slot)}
          </Headless.ComboboxOption>
        ))}
      </Headless.ComboboxOptions>
    </Headless.Combobox>
  )
}
