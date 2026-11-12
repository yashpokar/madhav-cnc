'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import {
  ErrorMessage,
  Field,
  FieldGroup,
  Label,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { quickCreateCustomer } from '@/lib/actions/customers'

export type NewCustomer = Extract<
  Awaited<ReturnType<typeof quickCreateCustomer>>,
  { ok: true }
>['customer']

/**
 * Add a customer without leaving the form you are in. Only the essentials are
 * asked for; the rest can be filled in later from the customer's page.
 */
export function QuickCustomerDialog({
  open,
  onClose,
  initialName = '',
  onCreated,
}: {
  open: boolean
  onClose: () => void
  initialName?: string
  onCreated: (customer: NewCustomer) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      {/* The form only mounts while open, so its fields start fresh each time. */}
      <QuickCustomerForm
        initialName={initialName}
        onClose={onClose}
        onCreated={onCreated}
      />
    </Dialog>
  )
}

function QuickCustomerForm({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string
  onClose: () => void
  onCreated: (customer: NewCustomer) => void
}) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)

    startTransition(async () => {
      const result = await quickCreateCustomer({ name, phone, city })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onCreated(result.customer)
      onClose()
    })
  }

  return (
    <>
      <DialogTitle>New customer</DialogTitle>
      <DialogDescription>
        Saved to your customers straight away and selected here. Add the address
        and GST details later.
      </DialogDescription>
      <DialogBody>
        <FieldGroup>
          <Field>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <Label>Phone</Label>
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  save()
                }
              }}
            />
          </Field>
          <Field>
            <Label>City</Label>
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
            {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button type="button" plain onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save customer'}
        </Button>
      </DialogActions>
    </>
  )
}
