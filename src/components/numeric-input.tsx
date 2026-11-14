'use client'

import { forwardRef, useCallback, type ComponentProps } from 'react'
import { Input } from '@/components/catalyst/input'

/** How many decimals a field allows, read from its `step` (0.01 → 2, 1 → 0). */
export function decimalsFor(step: unknown) {
  if (step === undefined || step === 'any') return 2
  const text = String(step)
  const dot = text.indexOf('.')

  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Keeps only what a number can contain: digits, one decimal point (if the
 * field takes decimals) and a leading minus (if it takes negatives). Strips
 * commas, letters and stray zeros ("007" → "7"), and cuts extra decimals.
 */
export function sanitizeNumber(raw: string, decimals: number, negative: boolean) {
  let value = raw.replace(/,/g, '').replace(/[^\d.-]/g, '')
  const minus = negative && value.startsWith('-')

  value = value.replace(/-/g, '')

  const [whole, ...rest] = value.split('.')
  let out = whole.replace(/^0+(?=\d)/, '')

  if (decimals > 0 && rest.length > 0) {
    out = `${out || '0'}.${rest.join('').slice(0, decimals)}`
  }

  return `${minus ? '-' : ''}${out}`
}

type Numeric = {
  min?: number | string
  max?: number | string
  step?: number | string
}

/** The props that make a text input behave as an exact numeric field. */
export function useNumericProps<E extends HTMLInputElement>(
  { min, max, step }: Numeric,
  handlers: {
    onChange?: (event: React.ChangeEvent<E>) => void
    onBlur?: (event: React.FocusEvent<E>) => void
    onKeyDown?: (event: React.KeyboardEvent<E>) => void
    onFocus?: (event: React.FocusEvent<E>) => void
  },
) {
  const decimals = decimalsFor(step)
  const negative = min === undefined || Number(min) < 0
  const lo = min === undefined || min === '' ? undefined : Number(min)
  const hi = max === undefined || max === '' ? undefined : Number(max)

  const onChange = useCallback(
    (event: React.ChangeEvent<E>) => {
      const clean = sanitizeNumber(event.target.value, decimals, negative)

      if (clean !== event.target.value) event.target.value = clean

      handlers.onChange?.(event)
    },
    [decimals, negative, handlers],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<E>) => {
      handlers.onKeyDown?.(event)

      if (event.defaultPrevented) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length > 1) return

      const current = event.currentTarget.value
      const allowed =
        /\d/.test(event.key) ||
        (event.key === '.' && decimals > 0 && !current.includes('.')) ||
        (event.key === '-' && negative && !current.includes('-'))

      if (!allowed) event.preventDefault()
    },
    [decimals, negative, handlers],
  )

  const onFocus = useCallback(
    (event: React.FocusEvent<E>) => {
      event.currentTarget.select()
      handlers.onFocus?.(event)
    },
    [handlers],
  )

  const onBlur = useCallback(
    (event: React.FocusEvent<E>) => {
      const input = event.currentTarget
      let next = input.value.replace(/\.$/, '')

      if (next !== '' && next !== '-') {
        const n = Number(next)

        if (hi !== undefined && n > hi) next = String(hi)
        else if (lo !== undefined && n < lo) next = String(lo)
      } else if (next === '-') {
        next = ''
      }

      if (next !== input.value) {
        // Go through the native setter so React sees a real input event.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

        setter?.call(input, next)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }

      handlers.onBlur?.(event)
    },
    [lo, hi, handlers],
  )

  return {
    type: 'text' as const,
    inputMode: (decimals > 0 ? 'decimal' : 'numeric') as 'decimal' | 'numeric',
    autoComplete: 'off',
    spellCheck: false,
    onChange,
    onKeyDown,
    onFocus,
    onBlur,
  }
}

/** A plain numeric input (no extra chrome), for dense tables and custom layouts. */
export const NumericInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<'input'>, 'type' | 'min' | 'max' | 'step'> & Numeric
>(function NumericInput({ min, max, step, onChange, onBlur, onKeyDown, onFocus, ...props }, ref) {
  const numeric = useNumericProps<HTMLInputElement>(
    { min, max, step },
    { onChange, onBlur, onKeyDown, onFocus },
  )

  return <input ref={ref} {...props} {...numeric} />
})

/** The app's styled Input, behaving as an exact numeric field. */
export function NumericField({
  min,
  max,
  step,
  onChange,
  onBlur,
  onKeyDown,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & Numeric) {
  const numeric = useNumericProps<HTMLInputElement>(
    { min, max, step },
    {
      onChange: onChange as never,
      onBlur: onBlur as never,
      onKeyDown: onKeyDown as never,
      onFocus: onFocus as never,
    },
  )

  return <Input {...props} {...numeric} className={`${props.className ?? ''} tabular-nums`} />
}
