'use client'

import { clampIso, formatIsoDate, isIsoDate, parseTypedDate, todayIso } from '@/lib/date-input'
import * as Headless from '@headlessui/react'
import { CalendarDaysIcon, XMarkIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { DayPicker, type DropdownProps } from 'react-day-picker'
import 'react-day-picker/style.css'
import { Listbox, ListboxLabel, ListboxOption } from './listbox'

type DateChangeEvent = { target: { name: string; value: string } }

function parseIso(value: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')

  if (!match) return undefined

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))

  return Number.isNaN(date.getTime()) ? undefined : date
}

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

function CalendarDropdown({ options, value, onChange, disabled }: DropdownProps) {
  return (
    <Listbox<string>
      className="w-auto"
      value={String(value ?? '')}
      disabled={disabled}
      aria-label="Jump to"
      onChange={(next) =>
        onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)
      }
    >
      {options?.map((option) => (
        <ListboxOption
          key={option.value}
          value={String(option.value)}
          disabled={option.disabled}
        >
          <ListboxLabel>{option.label}</ListboxLabel>
        </ListboxOption>
      ))}
    </Listbox>
  )
}

function addDays(iso: string, days: number) {
  const date = parseIso(iso) ?? new Date()

  return toIso(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/**
 * A themed date field that stands in for <input type="date">. Type a date
 * ('15/11/2026', '5 dec 2026', 'today') or pick one from the calendar. The
 * value contract is unchanged: an ISO yyyy-mm-dd string, submitted through a
 * hidden input named `name`, and onChange receives an event-like object so
 * existing handlers keep working.
 */
export function DatePicker({
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
  placeholder = 'dd/mm/yyyy',
  'aria-label': ariaLabel,
}: {
  className?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (event: DateChangeEvent) => void
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
  // What is being typed right now; null when the field shows the saved value.
  const [draft, setDraft] = useState<string | null>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const current = controlled ? value : inner
  const selected = parseIso(current)
  const minIso = isIsoDate(min) ? min : undefined
  const maxIso = isIsoDate(max) ? max : undefined
  const startMonth = parseIso(minIso)
  const endMonth = parseIso(maxIso)
  const today = todayIso()
  const shown = draft ?? formatIsoDate(current)
  const typedInvalid = draft !== null && draft.trim() !== '' && !parseTypedDate(draft, today)

  function commit(next: string, close?: () => void) {
    if (!controlled) setInner(next)
    if (next !== current) onChange?.({ target: { name: name ?? '', value: next } })
    close?.()
  }

  function commitDraft() {
    if (draft === null) return

    const text = draft.trim()

    setDraft(null)

    if (text === '') {
      if (!required) commit('')

      return
    }

    const parsed = parseTypedDate(text, today)

    if (parsed) commit(clampIso(parsed, minIso, maxIso))
  }

  const blocked = (iso: string) => clampIso(iso, minIso, maxIso) !== iso

  return (
    <Headless.Popover data-slot="control" className={clsx(className, 'relative block w-full')}>
      {({ close, open }) => (
        <>
          {name ? (
            <input type="hidden" name={name} value={current} required={required} />
          ) : null}
          <span
            data-invalid={invalid || typedInvalid ? '' : undefined}
            className={clsx(
              'group relative block w-full',
              'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
              'dark:before:hidden',
              'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset focus-within:after:ring-2 focus-within:after:ring-accent-500 has-data-invalid:focus-within:after:ring-red-500',
              disabled && 'opacity-50 before:bg-zinc-950/5 before:shadow-none',
            )}
          >
            <Headless.Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              role="combobox"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={ariaLabel}
              aria-invalid={invalid || typedInvalid ? true : undefined}
              title="Type a date such as 15/11/2026 or 5 Dec 2026, or press the down arrow to open the calendar"
              disabled={disabled}
              placeholder={placeholder}
              value={shown}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && draft !== null) {
                  event.preventDefault()
                  commitDraft()
                } else if (event.key === 'Escape' && draft !== null) {
                  event.preventDefault()
                  setDraft(null)
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  if (!open) toggle.current?.click()
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
              {current && !required && !disabled ? (
                <button
                  type="button"
                  aria-label="Clear date"
                  onClick={() => {
                    setDraft(null)
                    commit('')
                  }}
                  className="flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                >
                  <XMarkIcon className="size-4" />
                </button>
              ) : null}
              <Headless.PopoverButton
                ref={toggle}
                disabled={disabled}
                tabIndex={-1}
                aria-label="Open calendar"
                className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-800 data-open:bg-accent-50 data-open:text-accent-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <CalendarDaysIcon className="size-4" />
              </Headless.PopoverButton>
            </span>
          </span>
          {typedInvalid ? (
            <span role="alert" className="sr-only">
              Not a valid date. Try 15/11/2026 or 5 Dec 2026.
            </span>
          ) : null}

          <Headless.PopoverPanel
            transition
            focus
            anchor={{ to: 'bottom start', gap: 4, padding: 16 }}
            className="z-50 w-[min(calc(100vw-2rem),22rem)] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-zinc-950/10 transition duration-100 ease-out data-closed:translate-y-1 data-closed:opacity-0 dark:bg-zinc-800 dark:ring-white/10"
          >
            <DayPicker
              mode="single"
              required
              selected={selected}
              defaultMonth={selected ?? new Date()}
              onSelect={(date) => commit(toIso(date), close)}
              captionLayout="dropdown"
              startMonth={startMonth ?? new Date(Math.min(1930, selected?.getFullYear() ?? 1930), 0)}
              endMonth={
                endMonth ??
                new Date(Math.max(new Date().getFullYear() + 10, selected?.getFullYear() ?? 0), 11)
              }
              disabled={[
                ...(startMonth ? [{ before: startMonth }] : []),
                ...(endMonth ? [{ after: endMonth }] : []),
              ]}
              className="date-picker mx-auto"
              weekStartsOn={1}
              components={{ Dropdown: CalendarDropdown }}
            />
            <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-950/5 pt-3 dark:border-white/10">
              {[
                { label: 'Today', iso: today },
                { label: 'Tomorrow', iso: addDays(today, 1) },
              ].map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  disabled={blocked(quick.iso)}
                  onClick={() => commit(quick.iso, close)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs/5 font-medium ring-1 ring-inset disabled:opacity-40',
                    current === quick.iso
                      ? 'bg-accent-600 text-white ring-accent-600'
                      : 'text-zinc-700 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/10',
                  )}
                >
                  {quick.label}
                </button>
              ))}
              {current && !required ? (
                <button
                  type="button"
                  onClick={() => commit('', close)}
                  className="ml-auto rounded-full px-3 py-1 text-xs/5 font-medium text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </Headless.PopoverPanel>
        </>
      )}
    </Headless.Popover>
  )
}
