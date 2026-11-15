'use client'

import { useTransition } from 'react'
import { Button } from '@/components/catalyst/button'
import { notify } from '@/lib/toast'
import { startCheckout } from './actions'

/**
 * Creates the order on the server, then sends the browser to the payment
 * page. The result is confirmed on the
 * return page, by asking the gateway, never from this click.
 */
export function CheckoutButton({
  plan,
  label,
  open,
  outline = false,
}: {
  plan: string
  label: string
  /** False when payments are not configured yet. */
  open: boolean
  outline?: boolean
}) {
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button disabled outline className="w-full">
        Paid plans open soon
      </Button>
    )
  }

  function pay() {
    startTransition(async () => {
      const result = await startCheckout(plan)

      if (!result.ok) {
        notify.error('Could not start the payment', result.error)

        return
      }

      window.location.assign(result.redirectUrl)
    })
  }

  return (
    <div className="grid gap-1.5">
      {outline ? (
        <Button onClick={pay} disabled={pending} outline className="w-full">
          {pending ? 'Opening payment' : label}
        </Button>
      ) : (
        <Button onClick={pay} disabled={pending} className="w-full">
          {pending ? 'Opening payment' : label}
        </Button>
      )}
      <p className="text-center text-xs/5 text-zinc-500 dark:text-zinc-400">Pay securely with UPI, cards or net banking</p>
    </div>
  )
}
