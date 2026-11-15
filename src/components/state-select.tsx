'use client'

import { useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/16/solid'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { INDIA_STATES, normaliseState } from '@/lib/india-geo'

type StateOption = {
  name: string
  gstCode?: string
  code?: string
  /** A value that is not in the registry, kept exactly as it was entered. */
  other?: boolean
}

export const CONTROL_HEIGHT =
  'sm:[&_input]:py-[calc(--spacing(2)-1px)] [&_input]:pr-16 sm:[&_input]:pr-14'

/**
 * Searchable list of Indian states and union territories. The value is the
 * canonical state name (or whatever legacy text was already saved, which stays
 * selectable and is marked "Other"). Empty string means no state.
 */
export function StateSelect({
  value,
  onChange,
  invalid,
  disabled,
  placeholder = 'Search states…',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (state: string) => void
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}) {
  const known = normaliseState(value)
  const legacy = value.trim() && !known ? value.trim() : null

  const options = useMemo<StateOption[]>(() => {
    const list: StateOption[] = INDIA_STATES.map((state) => ({
      name: state.name,
      gstCode: state.gstCode,
      code: state.code,
    }))

    return legacy ? [{ name: legacy, other: true }, ...list] : list
  }, [legacy])

  const selected = known
    ? (options.find((option) => option.name === known.name) ?? null)
    : legacy
      ? options[0]
      : null

  return (
    <div className="relative">
      <Combobox<StateOption | null>
        options={options}
        value={selected}
        by={(a, b) => a?.name === b?.name}
        onChange={(option) => onChange(option?.name ?? '')}
        displayValue={(option) => option?.name ?? ''}
        filter={(option, query) => {
          if (!option) return true
          const q = query.trim().toLowerCase()

          return (
            option.name.toLowerCase().includes(q) ||
            (option.code ?? '').toLowerCase() === q ||
            (option.gstCode ?? '') === q
          )
        }}
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        aria-label={ariaLabel}
        className={CONTROL_HEIGHT}
      >
        {(option) => (
          <ComboboxOption value={option}>
            <ComboboxLabel>{option.name}</ComboboxLabel>
            <ComboboxDescription>
              {option.other ? 'Other' : `(${option.gstCode})`}
            </ComboboxDescription>
          </ComboboxOption>
        )}
      </Combobox>
      {selected ? (
        <button
          type="button"
          aria-label="Clear state"
          onClick={() => onChange('')}
          disabled={disabled}
          className="absolute inset-y-0 right-8 z-10 flex items-center px-1 text-zinc-400 hover:text-zinc-700 disabled:hidden sm:right-7"
        >
          <XMarkIcon className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
