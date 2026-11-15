'use client'

import { useEffect, useState } from 'react'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/catalyst/listbox'
import { loadDefaults, rememberDefaults } from '@/lib/form-defaults'
import { useQuickContext } from '@/lib/quick-context'
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
  remember = false,
}: {
  modes: PaymentModeOption[]
  name?: string
  defaultValue?: string | null
  value?: string
  onChange?: (id: string) => void
  /** New-record forms: start on the mode this person used last, and remember changes. */
  remember?: boolean
}) {
  const { userId, companyId } = useQuickContext()
  const [own, setOwn] = useState(defaultValue ?? modes[0]?.id ?? '')
  const current = value ?? own

  useEffect(() => {
    if (!remember || !userId) return

    const last = loadDefaults(userId, companyId).paymentMode

    if (last && modes.some((mode) => mode.id === last)) {
      // Syncing from browser storage, which only exists after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOwn(last)
      onChange?.(last)
    }
    // Only on first sight of the user: later changes are the person's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remember, userId, companyId])

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
        if (remember && userId) rememberDefaults(userId, companyId, { paymentMode: next })
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
