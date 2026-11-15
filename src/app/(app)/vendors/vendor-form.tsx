'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
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
import { Switch, SwitchField } from '@/components/catalyst/switch'
import { Textarea } from '@/components/catalyst/textarea'
import { Divider } from '@/components/catalyst/divider'
import { FormBanner } from '@/components/form-banner'
import type { FormState } from '@/lib/actions/vendors'

export type VendorFormValues = {
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  city: string | null
  description: string | null
  isActive: boolean
  openingPayable: number | null
  openingAsOf: string | null
}

export function VendorForm({
  action,
  values,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: VendorFormValues
  submitLabel: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    status: 'idle',
  })

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const existingId = state.status === 'error' ? state.existingId : undefined
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | null | undefined) =>
    submitted[name] ?? fallback ?? ''

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}
      {state.status === 'success' ? <FormBanner tone="success">{state.message}</FormBanner> : null}

      <Fieldset>
        <Legend>Vendor</Legend>
        <FieldGroup>
          <Field>
            <Label>Name</Label>
            <Input
              name="name"
              defaultValue={keep('name', values.name)}
              required
              invalid={Boolean(errors.name)}
            />
            {errors.name ? <ErrorMessage>{errors.name}</ErrorMessage> : null}
            {existingId ? (
              <p className="mt-2 text-sm/6">
                <Link
                  href={`/vendors/${existingId}`}
                  className="font-medium text-zinc-950 underline dark:text-white"
                >
                  Open existing vendor
                </Link>
              </p>
            ) : null}
          </Field>
          <Field>
            <Label>What they supply</Label>
            <Textarea
              name="description"
              rows={2}
              defaultValue={keep('description', values.description)}
              placeholder="e.g. Edge banding and hardware, billed monthly"
            />
            <Description>Optional. Shown under the name in lists.</Description>
          </Field>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Contact</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Contact person</Label>
              <Input name="contactName" defaultValue={keep('contactName', values.contactName)} />
            </Field>
            <Field>
              <Label>Phone</Label>
              <Input name="phone" type="tel" defaultValue={keep('phone', values.phone)} />
            </Field>
            <Field>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                defaultValue={keep('email', values.email)}
                invalid={Boolean(errors.email)}
              />
              {errors.email ? <ErrorMessage>{errors.email}</ErrorMessage> : null}
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field className="sm:col-span-2">
              <Label>Address</Label>
              <Input name="address" defaultValue={keep('address', values.address)} />
            </Field>
            <Field>
              <Label>City</Label>
              <Input name="city" defaultValue={keep('city', values.city)} />
            </Field>
          </div>
          <Field>
            <Label>GSTIN</Label>
            <Input
              name="gstin"
              defaultValue={keep('gstin', values.gstin)}
              invalid={Boolean(errors.gstin)}
              className="uppercase"
            />
            {errors.gstin ? <ErrorMessage>{errors.gstin}</ErrorMessage> : null}
          </Field>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Opening payable (you owe them)</Label>
              <Input
                name="openingPayable"
                type="number"
                step="0.01"
                min={0}
                defaultValue={keep(
                  'openingPayable',
                  values.openingPayable ? String(values.openingPayable) : null,
                )}
                invalid={Boolean(errors.openingPayable)}
              />
              {errors.openingPayable ? (
                <ErrorMessage>{errors.openingPayable}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label>As of</Label>
              <Input
                name="openingAsOf"
                type="date"
                defaultValue={keep('openingAsOf', values.openingAsOf)}
                invalid={Boolean(errors.openingAsOf)}
              />
              {errors.openingAsOf ? (
                <ErrorMessage>{errors.openingAsOf}</ErrorMessage>
              ) : null}
            </Field>
          </div>
          <SwitchField>
            <Label>Active</Label>
            <Description>
              Inactive vendors stay on past expenses but are not offered when adding new ones.
            </Description>
            <Switch name="isActive" defaultChecked={values.isActive} value="true" />
          </SwitchField>
        </FieldGroup>
      </Fieldset>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
