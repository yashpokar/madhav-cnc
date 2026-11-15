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
import { ReasonField, reasonOk } from '@/components/audit/reason-field'
import { FormBanner } from '@/components/form-banner'

/** Red trigger styling; `!` beats the zinc text set by Catalyst's outline/plain. */
export const DANGER_TRIGGER =
  'text-red-600! border-red-300! data-hover:bg-red-50! data-active:bg-red-50! [--btn-icon:var(--color-red-500)]! dark:text-red-400! dark:border-red-400/30! dark:data-hover:bg-red-400/10! dark:data-active:bg-red-400/10!'

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
  askReason = false,
  redirectTo,
  tone = 'danger',
  outline = true,
  disabled,
  blocked,
  children,
}: {
  label: string
  title: string
  description: React.ReactNode
  confirmLabel?: string
  /** Receives the reason when `askReason` is set. */
  action: (reason?: string) => Promise<Result>
  /** Ask why first (deleting money and document records): kept in the audit trail. */
  askReason?: boolean
  /** Where to go after success; omit to refresh the current page. */
  redirectTo?: string
  tone?: 'danger' | 'neutral'
  outline?: boolean
  disabled?: boolean
  /** Why it cannot be done right now; the dialog explains instead of confirming. */
  blocked?: string | null
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  function close() {
    if (!pending) {
      setOpen(false)
      setError(null)
      setReason('')
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await action(askReason ? reason.trim() : undefined)

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
        className={tone === 'danger' ? DANGER_TRIGGER : undefined}
        onClick={() => setOpen(true)}
      >
        {children ?? label}
      </Button>

      <Dialog open={open} onClose={close} size="md" role="alertdialog">
        <DialogTitle>{title}</DialogTitle>
        {blocked ? (
          <DialogBody>
            <div role="alert">
              <FormBanner tone="error">{blocked}</FormBanner>
            </div>
          </DialogBody>
        ) : (
          <DialogDescription>{description}</DialogDescription>
        )}
        {askReason && !blocked ? <ReasonField value={reason} onChange={setReason} disabled={pending} /> : null}
        {error ? (
          <DialogBody>
            <div role="alert">
              <FormBanner tone="error">{error}</FormBanner>
            </div>
          </DialogBody>
        ) : null}
        <DialogActions>
          <Button type="button" plain onClick={close} disabled={pending}>
            {blocked ? 'Close' : 'Cancel'}
          </Button>
          {blocked ? null : (
            <Button
              type="button"
              color={tone === 'danger' ? 'red' : 'dark/zinc'}
              onClick={confirm}
              disabled={pending || (askReason && !reasonOk(reason))}
              autoFocus={!askReason}
            >
              {pending ? 'Working…' : (confirmLabel ?? label)}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}
