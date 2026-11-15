'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { toastAction, type ToastAction } from '@/lib/toast'

/** Fires one toast when it first appears; renders nothing. */
export function ToastOnMount({ message, action }: { message: string; action?: ToastAction }) {
  useEffect(() => {
    if (!message) return
    // A fixed id stops a re-render (or React strict mode) from stacking duplicates.
    toast.success(message, { id: `banner:${message}`, action: toastAction(action) })
    // The action is derived from the same page data as the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message])

  return null
}
