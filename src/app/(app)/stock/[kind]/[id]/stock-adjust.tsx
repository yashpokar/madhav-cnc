'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { FormBanner } from '@/components/form-banner'
import { adjustStockAction, openingStockAction } from '@/lib/actions/stock'
import type { SimpleResult } from '@/lib/actions/stock'

export function StockAdjust({
  kind,
  id,
  today,
  canSetOpening,
  tracked,
}: {
  kind: 'item' | 'material'
  id: string
  today: string
  /** No opening stock has been set yet. */
  canSetOpening: boolean
  tracked: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [mode, setMode] = useState<'adjust' | 'opening' | null>(null)
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today)

  function submit() {
    startTransition(async () => {
      const outcome =
        mode === 'opening'
          ? await openingStockAction({ kind, id, qty: Number(qty), unitCost: Number(cost || 0), date })
          : await adjustStockAction({ kind, id, qty: Number(qty), reason, date })

      setResult(outcome)

      if (outcome.ok) {
        setMode(null)
        setQty('')
        setCost('')
        setReason('')
        router.refresh()
      }
    })
  }

  if (!tracked) {
    return (
      <FormBanner tone="error">
        Stock is not tracked for this {kind}. Turn on Track stock to record movements.
      </FormBanner>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <div role="status">
          <FormBanner tone={result.ok ? 'success' : 'error'}>
            {result.ok ? result.message : result.error}
          </FormBanner>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" {...(mode !== 'adjust' ? { outline: true as const } : { color: 'dark/zinc' as const })} onClick={() => setMode(mode === 'adjust' ? null : 'adjust')}>
          Adjust stock
        </Button>
        {canSetOpening ? (
          <Button
            type="button"
            {...(mode !== 'opening' ? { outline: true as const } : { color: 'dark/zinc' as const })}
            onClick={() => setMode(mode === 'opening' ? null : 'opening')}
          >
            Set opening stock
          </Button>
        ) : null}
      </div>

      {mode ? (
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <Label>{mode === 'opening' ? 'Opening quantity' : 'Quantity (+ add, - remove)'}</Label>
              <Input
                type="number"
                step="0.001"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                min={mode === 'opening' ? 0 : undefined}
              />
            </Field>
            {mode === 'opening' ? (
              <Field>
                <Label>Cost per unit</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                />
              </Field>
            ) : (
              <Field className="sm:col-span-1">
                <Label>Reason</Label>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Stock count, damage…" />
              </Field>
            )}
            <Field>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" plain onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || qty === '' || Number(qty) === 0 || (mode === 'adjust' && reason.trim() === '')}
              onClick={submit}
            >
              {pending ? 'Saving…' : mode === 'opening' ? 'Set opening stock' : 'Save adjustment'}
            </Button>
          </div>
        </FieldGroup>
      ) : null}
    </div>
  )
}
