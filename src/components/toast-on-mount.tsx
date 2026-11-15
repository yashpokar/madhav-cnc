'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

/** Fires one toast when it first appears; renders nothing. */
export function ToastOnMount({ message }: { message: string }) {
  useEffect(() => {
    if (!message) return
    // A fixed id stops a re-render (or React strict mode) from stacking duplicates.
    toast.success(message, { id: `banner:${message}` })
  }, [message])

  return null
}
