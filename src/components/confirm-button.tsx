'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { FormBanner } from '@/components/form-banner'

type Result = { ok: true; message: string; id?: string } | { ok: false; error: string }

/**
 * A button that asks before doing something that is hard to undo. Use it for
 * deletes and for changes that ripple into other records; do not use it for
 * routine, easily reversible actions.
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  action,
  redirectTo,
  tone = 'danger',
  outline = true,
  disabled,
  children,
}: {
  label: string
  title: string
  description: React.ReactNode
  confirmLabel?: string
  action: () => Promise<Result>
  /** Where to go after success; omit to refresh the current page. */
  redirectTo?: string
  tone?: 'danger' | 'neutral'
  outline?: boolean
  disabled?: boolean
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (!pending) {
      setOpen(false)
      setError(null)
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        setError(result.error)
        return
      }

      setOpen(false)

      if (redirectTo) {
        router.push(redirectTo)
      }

      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        {...(outline ? { outline: true } : { plain: true })}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children ?? label}
      </Button>

      <Dialog open={open} onClose={close} size="md" role="alertdialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {error ? (
          <DialogBody>
            <div role="alert">
              <FormBanner tone="error">{error}</FormBanner>
            </div>
          </DialogBody>
        ) : null}
        <DialogActions>
          <Button type="button" plain onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            color={tone === 'danger' ? 'red' : 'dark/zinc'}
            onClick={confirm}
            disabled={pending}
            autoFocus
          >
            {pending ? 'Working…' : (confirmLabel ?? label)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
