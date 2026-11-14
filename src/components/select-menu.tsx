'use client'

import { Listbox, ListboxLabel, ListboxOption } from '@/components/catalyst/listbox'

/**
 * The app's standard dropdown for choosing one value from a short list. Use it
 * instead of a browser <select>, which cannot be styled and looks different
 * on every device.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  placeholder?: string
  'aria-label': string
  className?: string
}) {
  return (
    <Listbox<string>
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
    >
      {options.map((option) => (
        <ListboxOption key={option.value} value={option.value}>
          <ListboxLabel>{option.label}</ListboxLabel>
        </ListboxOption>
      ))}
    </Listbox>
  )
}
