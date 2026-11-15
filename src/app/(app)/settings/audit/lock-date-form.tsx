'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LockClosedIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Description, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { setLockDate } from '@/lib/actions/audit'

/**
 * Closing the books: nothing dated on or before the lock date can be created,
 * changed or deleted, except by a company administrator who gives a reason.
 */
export function LockDateForm({ current }: { current: string | null }) {
  const router = useRouter()
  const [date, setDate] = useState(current ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const changed = date !== (current ?? '')
  const ready = changed && reason.trim().length >= 3

  function save() {
    setError(null)
    setSaved(null)

    startTransition(async () => {
      const result = await setLockDate(date || null, reason.trim())

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSaved(result.message)
      setReason('')
      router.refresh()
    })
  }

  return (
    <section aria-label="Lock date" className="surface-card grid gap-4 p-4 sm:p-5">
      <div className="grid gap-1">
        <div className="flex items-center gap-2 text-sm/6 font-semibold text-zinc-950 dark:text-white">
          <LockClosedIcon aria-hidden="true" className="size-4 text-zinc-500" />
          Lock date
        </div>
        <p className="max-w-prose text-sm/6 text-zinc-500 dark:text-zinc-400">
          Close the books up to a date. Payments, expenses, invoices, notes, bills, adjustments and stock dated on or
          before it can not be created, edited or deleted, except by an administrator who gives a reason. Changing the
          lock date is itself recorded here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-12">
        <Field className="sm:col-span-5">
          <Label>Books closed up to</Label>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Description>Leave empty to keep the books open.</Description>
        </Field>
        <Field className="sm:col-span-7">
          <Label>Reason for the change</Label>
          <Textarea
            rows={2}
            value={reason}
            maxLength={500}
            placeholder="e.g. March GST return filed"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <div role="alert">
          <FormBanner tone="error">{error}</FormBanner>
        </div>
      ) : null}
      {saved ? <FormBanner tone="success">{saved}</FormBanner> : null}

      <div>
        <Button type="button" onClick={save} disabled={pending || !ready}>
          {pending ? 'Saving…' : 'Save lock date'}
        </Button>
      </div>
    </section>
  )
}
