'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { FormBanner } from '@/components/form-banner'
import { quickCreateInvoiceFromOrder } from '@/lib/actions/invoices'

/**
 * One click from a completed order to a draft invoice. The draft opens for
 * review; nothing is issued until someone presses Issue there.
 */
export function QuickInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 gap-2">
      {error ? (
        <div role="alert">
          <FormBanner tone="error">{error}</FormBanner>
        </div>
      ) : null}
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await quickCreateInvoiceFromOrder(orderId)

              if (!result.ok) {
                setError(result.error)
                return
              }

              router.push(`/invoices/${result.id}?created=1`)
            })
          }
        >
          {pending ? 'Creating invoice…' : 'Create invoice'}
        </Button>
      </div>
    </div>
  )
}
