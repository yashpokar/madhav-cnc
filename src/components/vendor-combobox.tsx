'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import {
  Combobox,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'

type Option = { label: string; isNew?: boolean }

/**
 * Pick an existing vendor or type a new name. Vendors are not a separate
 * record: the name is stored on each expense, so a new name simply becomes
 * available in this list once an expense has been saved with it.
 */
export function VendorCombobox({
  name,
  options,
  defaultValue = '',
  invalid,
  placeholder = 'Search or add a vendor',
}: {
  name: string
  options: string[]
  defaultValue?: string
  invalid?: boolean
  placeholder?: string
}) {
  const [selected, setSelected] = useState<Option | null>(
    defaultValue ? { label: defaultValue } : null,
  )
  const [query, setQuery] = useState('')

  const typed = query.trim()
  const exact = options.some(
    (option) => option.toLowerCase() === typed.toLowerCase(),
  )

  const choices: Option[] = [
    ...options.map((label) => ({ label })),
    ...(typed && !exact ? [{ label: typed, isNew: true }] : []),
  ]

  return (
    <>
      <input type="hidden" name={name} value={selected?.label ?? ''} />
      <Combobox<Option | null>
        options={choices}
        value={selected}
        onChange={setSelected}
        onQueryChange={setQuery}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        displayValue={(option) => option?.label ?? ''}
        filter={(option, search) =>
          !option ||
          option.isNew ||
          option.label.toLowerCase().includes(search.toLowerCase())
        }
      >
        {(option) => (
          <ComboboxOption value={option}>
            {option.isNew ? (
              <>
                <PlusIcon />
                <ComboboxLabel>Add “{option.label}”</ComboboxLabel>
              </>
            ) : (
              <ComboboxLabel>{option.label}</ComboboxLabel>
            )}
          </ComboboxOption>
        )}
      </Combobox>
    </>
  )
}
