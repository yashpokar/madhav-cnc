'use client'

import { useActionState, useRef, useState } from 'react'
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
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Link } from '@/components/catalyst/link'
import { FormBanner } from '@/components/form-banner'
import { LocationFields } from '@/components/location-fields'
import { ImageSlot } from './image-slot'
import { updateCompanySetting } from '@/lib/actions/company'
import type { FormState, SimpleResult } from '@/lib/actions/company'
import type { CompanySetting } from '@/lib/queries/company'
import { getIndustry } from '@/lib/industry'

export function CompanyForm({ setting }: { setting: CompanySetting }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateCompanySetting,
    { status: 'idle' },
  )

  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoVersion, setLogoVersion] = useState(0)
  const [hasLogo, setHasLogo] = useState(Boolean(setting.logoStoredName))
  const [logoResult, setLogoResult] = useState<SimpleResult | null>(null)

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  async function uploadImage(
    file: File,
    endpoint: string,
    onDone: () => void,
  ) {
    setLogoResult(null)

    const body = new FormData()
    body.append('file', file)

    const response = await fetch(endpoint, { method: 'POST', body })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      setLogoResult({ ok: false, error: payload?.error ?? 'Upload failed' })
      return
    }

    onDone()
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      <form action={formAction} className="grid grid-cols-1 gap-8">
        {state.status === 'error' ? (
          <FormBanner tone="error">{state.message}</FormBanner>
        ) : null}
        {state.status === 'success' ? (
          <FormBanner tone="success">{state.message}</FormBanner>
        ) : null}

        <Fieldset>
          <Legend>Business</Legend>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <Label>Company name</Label>
                <Input
                  name="companyName"
                  defaultValue={keep('companyName', setting.companyName)}
                  required
                  invalid={Boolean(errors.companyName)}
                />
                {errors.companyName ? (
                  <ErrorMessage>{errors.companyName}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Phone</Label>
                <Input name="phone" defaultValue={keep('phone', setting.phone)} />
              </Field>
            </div>

            <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
              Industry: <strong className="font-medium text-zinc-950 dark:text-white">{getIndustry(setting.industry).label}</strong>.
              Chosen at setup and fixed in this version, because it decides the units, stages and
              categories your company started with. You can still edit all of those directly.
            </p>

            <Field>
              <Label>Address</Label>
              <Textarea
                name="addressLine"
                rows={2}
                defaultValue={keep('addressLine', setting.addressLine)}
              />
            </Field>

            <LocationFields
              defaultState={keep('state', setting.state)}
              defaultCity={keep('city', setting.city)}
              defaultPincode={keep('pincode', setting.pincode)}
              errors={{ pincode: errors.pincode }}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Field>
                <Label>Email</Label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={keep('email', setting.email)}
                  invalid={Boolean(errors.email)}
                />
                {errors.email ? <ErrorMessage>{errors.email}</ErrorMessage> : null}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>GSTIN</Label>
                <Input
                  name="gstin"
                  className="uppercase"
                  defaultValue={keep('gstin', setting.gstin)}
                  invalid={Boolean(errors.gstin)}
                />
                {errors.gstin ? <ErrorMessage>{errors.gstin}</ErrorMessage> : null}
              </Field>
              <Field>
                <Label>PAN</Label>
                <Input
                  name="pan"
                  className="uppercase"
                  defaultValue={keep('pan', setting.pan)}
                  invalid={Boolean(errors.pan)}
                />
                {errors.pan ? <ErrorMessage>{errors.pan}</ErrorMessage> : null}
              </Field>
            </div>
          </FieldGroup>
        </Fieldset>

        <Text>
          Bank details, UPI and other ways to pay are now set up under{' '}
          <Link href="/settings/payment-modes" className="font-medium underline">
            Payment modes
          </Link>
          .
        </Text>

        <Divider />

        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Default advance %</Label>
              <Input
                name="defaultAdvancePercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={keep('defaultAdvancePercent', Number(setting.defaultAdvancePercent))}
                invalid={Boolean(errors.defaultAdvancePercent)}
              />
              {errors.defaultAdvancePercent ? (
                <ErrorMessage>{errors.defaultAdvancePercent}</ErrorMessage>
              ) : (
                <Description>
                  Applied to new quotations. Each quotation can override it.
                </Description>
              )}
            </Field>
            <Field>
              <Label>Invoice terms</Label>
              <Textarea
                name="invoiceTerms"
                rows={4}
                defaultValue={keep('invoiceTerms', setting.invoiceTerms)}
              />
              <Description>Default terms printed on invoices.</Description>
            </Field>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Signatory name</Label>
                <Input
                  name="signatoryName"
                  defaultValue={keep('signatoryName', setting.signatoryName)}
                />
                <Description>Printed under the signature on invoices.</Description>
              </Field>
              <Field>
                <Label>Signatory title</Label>
                <Input
                  name="signatoryTitle"
                  placeholder="Authorised signatory"
                  defaultValue={keep('signatoryTitle', setting.signatoryTitle)}
                />
              </Field>
            </div>
          </FieldGroup>
        </Fieldset>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </form>

      <Divider />

      <div className="grid grid-cols-1 gap-4">
        <Subheading level={2}>Logo</Subheading>

        {logoResult ? (
          <FormBanner tone={logoResult.ok ? 'success' : 'error'}>
            {logoResult.ok ? logoResult.message : logoResult.error}
          </FormBanner>
        ) : null}

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex size-28 items-center justify-center rounded-lg bg-zinc-100 p-2 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
            {hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo served by our API route; next/image cannot optimise it
              <img
                key={logoVersion}
                src={`/api/company/logo?v=${logoVersion}`}
                alt="Company logo"
                className="size-full object-contain"
              />
            ) : (
              <Text className="text-center text-xs/5">No logo</Text>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Text>
              Shown on quotations shared with customers. A square image works
              best.
            </Text>
            <div>
              <Button
                outline
                onClick={() => logoInputRef.current?.click()}
              >
                {hasLogo ? 'Replace logo' : 'Upload logo'}
              </Button>
            </div>
          </div>
        </div>

        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]

            if (file) {
              void uploadImage(file, '/api/company/logo', () => {
                setHasLogo(true)
                setLogoVersion((value) => value + 1)
                setLogoResult({ ok: true, message: 'Logo updated' })
              })
            }

            event.target.value = ''
          }}
        />
      </div>

      <Divider />

      <ImageSlot
        title="Signature"
        endpoint="/api/company/signature"
        initiallyHasImage={Boolean(setting.signatureStoredName)}
        emptyLabel="No signature"
        help="Printed on invoices above the signatory's name. Use a photo or scan of the signature on a white or transparent background."
      />

      <Divider />

      <ImageSlot
        title="Stamp"
        endpoint="/api/company/stamp"
        initiallyHasImage={Boolean(setting.stampStoredName)}
        emptyLabel="No stamp"
        help="The company seal, printed beside the signature on invoices. Optional."
      />
    </div>
  )
}
