'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { ErrorMessage, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'

/** A one-field dialog for adding a simple named record on the spot. */
export function QuickNameDialog({
  open,
  onClose,
  title,
  label,
  save,
}: {
  open: boolean
  onClose: () => void
  title: string
  label: string
  /** Return an error message to show, or null when saved. */
  save: (name: string) => Promise<string | null>
}) {
  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <NameForm title={title} label={label} save={save} onClose={onClose} />
    </Dialog>
  )
}

function NameForm({
  title,
  label,
  save,
  onClose,
}: {
  title: string
  label: string
  save: (name: string) => Promise<string | null>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)

    startTransition(async () => {
      const message = await save(name)

      if (message) {
        setError(message)
        return
      }

      onClose()
    })
  }

  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <Field>
          <Label>{label}</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
            autoFocus
          />
          {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button type="button" plain onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </>
  )
}
