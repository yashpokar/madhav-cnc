'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setEntryChecked } from '@/lib/actions/expenses'

/** The sheet's CHECK BOX column: tick an entry off once it has been verified. */
export function CheckCell({
  kind,
  id,
  checked,
  disabled,
  label,
}: {
  kind: 'expense' | 'credit' | 'receipt'
  id: string
  checked: boolean
  disabled?: boolean
  label: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [value, setValue] = useOptimistic(checked)

  return (
    <input
      type="checkbox"
      checked={value}
      disabled={disabled}
      aria-label={`Checked: ${label}`}
      className="size-4 cursor-pointer rounded border-zinc-400 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      onChange={(event) => {
        const next = event.target.checked

        startTransition(async () => {
          setValue(next)
          const result = await setEntryChecked(kind, id, next)

          if (result.ok) router.refresh()
        })
      }}
    />
  )
}
