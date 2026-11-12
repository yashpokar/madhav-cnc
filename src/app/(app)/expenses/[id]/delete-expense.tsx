'use client'

import { ConfirmButton } from '@/components/confirm-button'
import { deleteExpense } from '@/lib/actions/expenses'

export function DeleteExpense({ id }: { id: string }) {
  return (
    <ConfirmButton
      label="Delete expense"
      title="Delete this expense?"
      description="This permanently removes the expense and changes your expense totals. This cannot be undone."
      redirectTo="/expenses"
      action={() => deleteExpense(id)}
    />
  )
}
