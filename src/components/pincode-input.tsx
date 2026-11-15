'use client'

import { useState } from 'react'
import { ErrorMessage } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { isValidPincode } from '@/lib/india-geo'

/**
 * Six-digit Indian pincode field: numeric keypad, digits only. Shows a format
 * message once the user leaves the field with something invalid in it, and
 * always shows a server-side `error` when given.
 */
export function PincodeInput({
  value,
  onChange,
  error,
  placeholder = '6 digits',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (pincode: string) => void
  error?: string
  placeholder?: string
  'aria-label'?: string
}) {
  const [touched, setTouched] = useState(false)
  const formatError =
    touched && value && !isValidPincode(value) ? 'Pincode must be 6 digits' : null
  const message = error ?? formatError

  return (
    <>
      <Input
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        invalid={Boolean(message)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        onBlur={() => setTouched(true)}
      />
      {message ? <ErrorMessage>{message}</ErrorMessage> : null}
    </>
  )
}
