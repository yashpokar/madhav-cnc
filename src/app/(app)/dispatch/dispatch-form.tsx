'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { UNIT_SHORT } from '@/lib/labels'
import type { FormState } from '@/lib/actions/dispatches'
import type { DispatchableLine } from '@/lib/queries/dispatches'

export type DispatchFormValues = {
  orderId: string
  dispatchDate: string
  vehicleNumber: string | null
  driverName: string | null
  driverPhone: string | null
  transporterName: string | null
  lrNumber: string | null
  deliveryAddress: string | null
  deliveryCity: string | null
  deliveryPincode: string | null
  notes: string | null
  quantities: Record<string, string>
}

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function DispatchForm({
  action,
  values,
  lines,
  submitLabel,
  orderNumber,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: DispatchFormValues
  lines: DispatchableLine[]
  submitLabel: string
  orderNumber: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const [quantities, setQuantities] = useState<Record<string, string>>(
    values.quantities,
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | null) =>
    submitted[name] ?? fallback ?? ''

  const selected = lines
    .filter((line) => num(quantities[line.id] ?? '') > 0)
    .map((line) => ({
      orderLineId: line.id,
      description: line.description,
      unit: line.unit,
      quantity: quantities[line.id] ?? '0',
    }))

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      <input type="hidden" name="orderId" value={values.orderId} />
      <input type="hidden" name="lines" value={JSON.stringify(selected)} />

      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>What is going out</Legend>
        <Text className="mt-2">
          From order {orderNumber}. Enter the quantity leaving now; leave a line
          at zero to send it later.
        </Text>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm/6">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="w-8 pb-2 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Ordered</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Sent</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Pending</th>
                <th className="w-32 pb-2 text-right font-medium">Dispatch now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 pr-2 tabular-nums text-zinc-500 dark:text-zinc-400">
                    {line.position}
                  </td>
                  <td className="py-2 pr-3 font-medium">{line.description}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {line.ordered} {UNIT_SHORT[line.unit]}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                    {line.dispatched}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">
                    {line.remaining}
                  </td>
                  <td className="py-2">
                    <Input
                      aria-label={`Dispatch quantity for ${line.description}`}
                      type="number"
                      step="0.001"
                      min={0}
                      max={line.remaining}
                      disabled={line.remaining <= 0}
                      value={quantities[line.id] ?? ''}
                      onChange={(event) =>
                        setQuantities((state) => ({
                          ...state,
                          [line.id]: event.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected.length === 0 ? (
          <div className="mt-4">
            <Text>Nothing selected yet. Enter a quantity on at least one line.</Text>
          </div>
        ) : null}
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Transport</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Dispatch date</Label>
              <Input
                name="dispatchDate"
                type="date"
                defaultValue={keep('dispatchDate', values.dispatchDate)}
                required
              />
            </Field>
            <Field>
              <Label>Vehicle number</Label>
              <Input
                name="vehicleNumber"
                className="uppercase"
                defaultValue={keep('vehicleNumber', values.vehicleNumber)}
              />
            </Field>
            <Field>
              <Label>LR number</Label>
              <Input
                name="lrNumber"
                defaultValue={keep('lrNumber', values.lrNumber)}
              />
              <Description>Transporter's consignment note.</Description>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Driver name</Label>
              <Input
                name="driverName"
                defaultValue={keep('driverName', values.driverName)}
              />
            </Field>
            <Field>
              <Label>Driver phone</Label>
              <Input
                name="driverPhone"
                type="tel"
                defaultValue={keep('driverPhone', values.driverPhone)}
              />
            </Field>
            <Field>
              <Label>Transporter</Label>
              <Input
                name="transporterName"
                defaultValue={keep('transporterName', values.transporterName)}
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Delivery address</Legend>
        <FieldGroup>
          <Field>
            <Label>Address</Label>
            <Textarea
              name="deliveryAddress"
              rows={2}
              defaultValue={keep('deliveryAddress', values.deliveryAddress)}
            />
            <Description>Prefilled from the order's site address.</Description>
          </Field>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>City</Label>
              <Input
                name="deliveryCity"
                defaultValue={keep('deliveryCity', values.deliveryCity)}
              />
            </Field>
            <Field>
              <Label>Pincode</Label>
              <Input
                name="deliveryPincode"
                inputMode="numeric"
                defaultValue={keep('deliveryPincode', values.deliveryPincode)}
                invalid={Boolean(errors.deliveryPincode)}
              />
              {errors.deliveryPincode ? (
                <ErrorMessage>{errors.deliveryPincode}</ErrorMessage>
              ) : null}
            </Field>
          </div>
          <Field>
            <Label>Notes</Label>
            <Textarea
              name="notes"
              rows={3}
              defaultValue={keep('notes', values.notes)}
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || selected.length === 0}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
