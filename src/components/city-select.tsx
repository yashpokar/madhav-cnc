'use client'

import { useMemo, useState } from 'react'
import { PlusIcon, XMarkIcon } from '@heroicons/react/16/solid'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { CONTROL_HEIGHT } from '@/components/state-select'
import { canonicalCity, citiesFor, normaliseState } from '@/lib/india-geo'

type CityOption = {
  value: string
  /** From the state's list, a value kept from before, or typed free text. */
  kind: 'listed' | 'kept' | 'typed'
}

/**
 * City picker for a chosen state. Lists the state's cities but accepts any
 * text: type a name and pick "Use “name”" (or just tab away and the typed text
 * is kept). Disabled with a hint until a state is set, unless a city is
 * already saved (older records may have a city but no state).
 */
export function CitySelect({
  value,
  onChange,
  state,
  invalid,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (city: string) => void
  /** The state value as entered; empty means none chosen yet. */
  state: string
  invalid?: boolean
  'aria-label'?: string
}) {
  const [query, setQuery] = useState('')
  const stateKnown = normaliseState(state)
  const hasState = Boolean(state.trim())
  const disabled = !hasState && !value.trim()
  const cities = useMemo(() => citiesFor(state), [state])

  const current = value.trim()
  const inList = Boolean(current && canonicalCity(state, current))
  const typed = query.trim()

  const options = useMemo<CityOption[]>(() => {
    const list: CityOption[] = cities.map((city) => ({
      value: city,
      kind: 'listed',
    }))
    const known = new Set(cities.map((city) => city.toLowerCase()))

    if (current && !known.has(current.toLowerCase())) {
      list.unshift({ value: current, kind: 'kept' })
      known.add(current.toLowerCase())
    }

    if (typed && !known.has(typed.toLowerCase())) {
      list.push({ value: typed, kind: 'typed' })
    }

    return list
  }, [cities, current, typed])

  const selected = current
    ? (options.find(
        (option) =>
          option.kind !== 'typed' &&
          option.value.toLowerCase() === current.toLowerCase(),
      ) ?? null)
    : null

  // While disabled, the placeholder already says "Choose a state first".
  const hint = disabled
    ? null
    : current && hasState && !inList
      ? stateKnown && cities.length > 0
        ? `Not in the ${stateKnown.name} list. Saved as typed.`
        : 'Saved as typed.'
      : null

  return (
    <div data-slot="control" className="relative">
      <div
        className="relative"
        onBlur={(event) => {
          // Keep text that was typed but never picked.
          const input = event.target
          if (!(input instanceof HTMLInputElement)) return
          const text = input.value.trim()
          if (text && text.toLowerCase() !== current.toLowerCase()) {
            onChange(canonicalCity(state, text) ?? text)
          }
        }}
      >
        <Combobox<CityOption | null>
          options={options}
          value={selected}
          by={(a, b) => a?.value.toLowerCase() === b?.value.toLowerCase()}
          onChange={(option) => onChange(option?.value ?? '')}
          onQueryChange={setQuery}
          displayValue={(option) => option?.value ?? ''}
          filter={(option, search) =>
            !option ||
            option.kind === 'typed' ||
            option.value.toLowerCase().includes(search.trim().toLowerCase())
          }
          placeholder={disabled ? 'Choose a state first' : 'Search or type a city…'}
          disabled={disabled}
          invalid={invalid}
          aria-label={ariaLabel}
          className={CONTROL_HEIGHT}
        >
          {(option) => (
            <ComboboxOption value={option}>
              {option.kind === 'typed' ? (
                <>
                  <PlusIcon />
                  <ComboboxLabel>Use “{option.value}”</ComboboxLabel>
                </>
              ) : (
                <>
                  <ComboboxLabel>{option.value}</ComboboxLabel>
                  {option.kind === 'kept' ? (
                    <ComboboxDescription>Other</ComboboxDescription>
                  ) : null}
                </>
              )}
            </ComboboxOption>
          )}
        </Combobox>
        {current && !disabled ? (
          <button
            type="button"
            aria-label="Clear city"
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-8 z-10 flex items-center px-1 text-zinc-400 hover:text-zinc-700 sm:right-7"
          >
            <XMarkIcon className="size-4" />
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  )
}
