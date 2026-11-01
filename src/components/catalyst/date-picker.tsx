'use client'

import * as Headless from '@headlessui/react'
import { CalendarDaysIcon, XMarkIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { useState } from 'react'
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

const display = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/**
 * A themed calendar popover that stands in for <input type="date">. It keeps
 * the same value contract (an ISO yyyy-mm-dd string, submitted through a
 * hidden input named `name`) and calls onChange with an event-like object so
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
  placeholder = 'Pick a date',
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
  const current = controlled ? value : inner
  const selected = parseIso(current)
  const startMonth = parseIso(min)
  const endMonth = parseIso(max)

  function commit(next: string, close?: () => void) {
    if (!controlled) setInner(next)
    onChange?.({ target: { name: name ?? '', value: next } })
    close?.()
  }

  return (
    <Headless.Popover data-slot="control" className={clsx(className, 'relative block w-full')}>
      {({ close }) => (
        <>
          {name ? (
            <input type="hidden" name={name} value={current} required={required} />
          ) : null}
          <span
            data-invalid={invalid ? '' : undefined}
            className={clsx(
              'group relative block w-full',
              'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
              'dark:before:hidden',
              'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset has-data-focus:after:ring-2 has-data-focus:after:ring-blue-500',
              disabled && 'opacity-50 before:bg-zinc-950/5 before:shadow-none',
            )}
          >
            <Headless.PopoverButton
              disabled={disabled}
              aria-label={ariaLabel}
              className={clsx(
                'relative flex min-h-11 w-full appearance-none items-center gap-2 rounded-lg border bg-transparent px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] text-left text-base/6 focus:outline-hidden sm:min-h-9 sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6 dark:bg-white/5',
                invalid
                  ? 'border-red-500 dark:border-red-600'
                  : 'border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20',
                selected
                  ? 'text-zinc-950 dark:text-white'
                  : 'text-zinc-500',
              )}
            >
              <CalendarDaysIcon className="size-5 shrink-0 text-zinc-500 sm:size-4 dark:text-zinc-400" />
              <span className="min-w-0 flex-1 truncate">
                {selected ? display.format(selected) : placeholder}
              </span>
            </Headless.PopoverButton>
            {selected && !required && !disabled ? (
              <button
                type="button"
                aria-label="Clear date"
                onClick={() => commit('')}
                className="absolute inset-y-0 right-2 z-10 flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <XMarkIcon className="size-5 sm:size-4" />
              </button>
            ) : null}
          </span>

          <Headless.PopoverPanel
            transition
            anchor={{ to: 'bottom start', gap: 4, padding: 16 }}
            className="z-50 rounded-xl bg-white p-3 shadow-lg ring-1 ring-zinc-950/10 transition duration-100 ease-out data-closed:opacity-0 dark:bg-zinc-800 dark:ring-white/10"
          >
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected ?? new Date()}
              onSelect={(date) => commit(date ? toIso(date) : '', close)}
              captionLayout="dropdown"
              startMonth={startMonth ?? new Date(1930, 0)}
              endMonth={endMonth ?? new Date(new Date().getFullYear() + 10, 11)}
              disabled={[
                ...(startMonth ? [{ before: startMonth }] : []),
                ...(endMonth ? [{ after: endMonth }] : []),
              ]}
              className="date-picker"
              components={{ Dropdown: CalendarDropdown }}
            />
          </Headless.PopoverPanel>
        </>
      )}
    </Headless.Popover>
  )
}
