'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { ErrorMessage, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { money } from '@/lib/format'
import { UNIT_SHORT } from '@/lib/labels'
import type { FormState } from '@/lib/actions/goods-receipts'
import type { UnitOfMeasure } from '@/generated/prisma/enums'

export type ReceiptFormLine = {
  lineId: string
  description: string
  unit: string
  ordered: number
  received: number
  remaining: number
  unitCost: number
  tracked: boolean
}

export function ReceiptForm({
  action,
  source,
  lines,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  source: { kind: 'bill' | 'order'; id: string }
  lines: ReceiptFormLine[]
  today: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    status: 'idle',
  })
  // What is being received now, per line. Starts with everything still to come.
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.lineId, line.remaining > 0 ? String(line.remaining) : ''])),
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const payload = lines
    .map((line) => ({ lineId: line.lineId, qty: Number(qty[line.lineId] || 0) }))
    .filter((line) => line.qty > 0)

  return (
    <form action={formAction} className="grid w-full max-w-5xl grid-cols-1 gap-6">
      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}

      <input type="hidden" name={source.kind === 'bill' ? 'billId' : 'poId'} value={source.id} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader>Description</TableHeader>
              <TableHeader className="text-right">{source.kind === 'bill' ? 'Billed' : 'Ordered'}</TableHeader>
              <TableHeader className="text-right">Received</TableHeader>
              <TableHeader className="text-right">Remaining</TableHeader>
              <TableHeader className="text-right">Unit cost</TableHeader>
              <TableHeader className="w-40 text-right">Receive now</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.lineId}>
                <TableCell className="font-medium">
                  {line.description}
                  {line.tracked ? null : (
                    <div>
                      <Badge color="zinc">Stock not tracked</Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.ordered} {UNIT_SHORT[line.unit as UnitOfMeasure]}
                </TableCell>
                <TableCell className="text-right tabular-nums">{line.received}</TableCell>
                <TableCell className="text-right tabular-nums">{line.remaining}</TableCell>
                <TableCell className="text-right tabular-nums">{money.format(line.unitCost)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0}
                    max={line.remaining}
                    disabled={line.remaining <= 0}
                    aria-label={`Quantity received for ${line.description}`}
                    className="text-right"
                    value={qty[line.lineId] ?? ''}
                    onChange={(event) =>
                      setQty((current) => ({ ...current, [line.lineId]: event.target.value }))
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FieldGroup>
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field>
            <Label>Received on</Label>
            <Input
              name="receivedOn"
              type="date"
              defaultValue={today}
              required
              invalid={Boolean(errors.receivedOn)}
            />
            {errors.receivedOn ? <ErrorMessage>{errors.receivedOn}</ErrorMessage> : null}
          </Field>
        </div>
        <Field>
          <Label>Notes</Label>
          <Textarea name="notes" rows={2} placeholder="Vehicle, challan number, condition on arrival…" />
        </Field>
      </FieldGroup>

      <div className="form-actions">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || payload.length === 0}>
          {pending ? 'Posting…' : 'Post receipt'}
        </Button>
      </div>
    </form>
  )
}
