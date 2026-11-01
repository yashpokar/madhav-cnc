'use client'

import React, { forwardRef } from 'react'
import { Listbox, ListboxLabel, ListboxOption } from './listbox'

type OptionItem = { value: string; label: string; disabled: boolean }

function textOf(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number' ? String(child) : '',
    )
    .join('')
}

function collect(children: React.ReactNode, into: OptionItem[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    const props = child.props as {
      value?: string | number
      disabled?: boolean
      children?: React.ReactNode
    }

    if (child.type === 'option') {
      const label = textOf(props.children)

      into.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
      })
    } else if (props.children) {
      // Fragments and <optgroup> just wrap more options.
      collect(props.children, into)
    }
  })
}

type SelectChangeEvent = { target: { name: string; value: string } }

/**
 * Themed dropdown that replaces the browser's native <select>. It keeps the
 * <select> call-site API: <option> children, name/value/defaultValue, and an
 * onChange that receives an event-like object with target.value.
 */
export const Select = forwardRef(function Select(
  {
    className,
    name,
    value,
    defaultValue,
    onChange,
    disabled,
    invalid,
    children,
    'aria-label': ariaLabel,
  }: {
    className?: string
    name?: string
    value?: string | number
    defaultValue?: string | number
    onChange?: (event: SelectChangeEvent) => void
    disabled?: boolean
    invalid?: boolean
    required?: boolean
    children?: React.ReactNode
    'aria-label'?: string
  },
  // The themed control has no single underlying <select> to hand back.
  _ref: React.ForwardedRef<HTMLSelectElement>,
) {
  const options: OptionItem[] = []
  collect(children, options)

  const selection =
    value !== undefined
      ? { value: String(value) }
      : { defaultValue: defaultValue !== undefined ? String(defaultValue) : options[0]?.value ?? '' }

  return (
    <Listbox<string>
      className={className}
      name={name}
      disabled={disabled}
      invalid={invalid}
      aria-label={ariaLabel}
      onChange={(next) => onChange?.({ target: { name: name ?? '', value: next } })}
      {...selection}
    >
      {options.map((option) => (
        <ListboxOption key={option.value} value={option.value} disabled={option.disabled}>
          <ListboxLabel>{option.label}</ListboxLabel>
        </ListboxOption>
      ))}
    </Listbox>
  )
})
