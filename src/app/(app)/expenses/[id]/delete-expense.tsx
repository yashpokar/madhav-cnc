'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { FormBanner } from '@/components/form-banner'
import { deleteExpense } from '@/lib/actions/expenses'

export function DeleteExpense({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 gap-3">
      {error ? <FormBanner tone="error">{error}</FormBanner> : null}
      <Button
        outline
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteExpense(id)

            if (result.ok) {
              router.push('/expenses')
            } else {
              setError(result.error)
            }
          })
        }
      >
        Delete expense
      </Button>
    </div>
  )
}
