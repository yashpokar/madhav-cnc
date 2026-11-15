'use client'

import { useState } from 'react'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/catalyst/listbox'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'

/**
 * Picks one of the company's payment modes ("Cash", "HDFC NEFT", "SBI UPI").
 * Posts the mode's id under `name`, and reports it through `onChange` when the
 * form keeps the value in state instead.
 */
export function PaymentModeSelect({
  modes,
  name,
  defaultValue,
  value,
  onChange,
}: {
  modes: PaymentModeOption[]
  name?: string
  defaultValue?: string | null
  value?: string
  onChange?: (id: string) => void
}) {
  const [own, setOwn] = useState(defaultValue ?? modes[0]?.id ?? '')
  const current = value ?? own

  if (modes.length === 0) {
    return (
      <p className="text-sm/6 text-zinc-500">
        No payment modes yet. Add them under Settings → Payment modes.
      </p>
    )
  }

  return (
    <Listbox
      name={name}
      value={current}
      onChange={(next: string) => {
        setOwn(next)
        onChange?.(next)
      }}
      aria-label="Payment mode"
    >
      {modes.map((mode) => (
        <ListboxOption key={mode.id} value={mode.id}>
          <ListboxLabel>{mode.name}</ListboxLabel>
        </ListboxOption>
      ))}
    </Listbox>
  )
}
