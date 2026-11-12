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
import { Select } from '@/components/catalyst/select'
import { quickCreateItem } from '@/lib/actions/items'
import { UNIT_LABELS } from '@/lib/labels'
import { UnitOfMeasure } from '@/generated/prisma/enums'

export type NewItem = Extract<
  Awaited<ReturnType<typeof quickCreateItem>>,
  { ok: true }
>['item']

/** Add an item to the catalogue from inside a quotation or order line. */
export function QuickItemDialog({
  open,
  onClose,
  initialName = '',
  onCreated,
}: {
  open: boolean
  onClose: () => void
  initialName?: string
  onCreated: (item: NewItem) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      {/* Mounted only while open, so the fields start fresh every time. */}
      <QuickItemForm
        initialName={initialName}
        onClose={onClose}
        onCreated={onCreated}
      />
    </Dialog>
  )
}

function QuickItemForm({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string
  onClose: () => void
  onCreated: (item: NewItem) => void
}) {
  const [name, setName] = useState(initialName)
  const [unit, setUnit] = useState<UnitOfMeasure>('NOS')
  const [rate, setRate] = useState('')
  const [tax, setTax] = useState('18')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)

    startTransition(async () => {
      const result = await quickCreateItem({
        name,
        unit,
        rate,
        taxRatePercent: tax,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onCreated(result.item)
      onClose()
    })
  }

  return (
    <>
      <DialogTitle>New item</DialogTitle>
      <DialogDescription>
        Added to your item list and used on this line. Set the material, HSN
        code and other details later from Items.
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <Label>Unit</Label>
              <Select
                value={unit}
                onChange={(event) => setUnit(event.target.value as UnitOfMeasure)}
              >
                {Object.values(UnitOfMeasure).map((value) => (
                  <option key={value} value={value}>
                    {UNIT_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Rate (₹)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </Field>
            <Field>
              <Label>GST %</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    save()
                  }
                }}
              />
            </Field>
          </div>
          {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button type="button" plain onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save item'}
        </Button>
      </DialogActions>
    </>
  )
}
