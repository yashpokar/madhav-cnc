'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
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
import { removeUpiQr, updateCompanySetting } from '@/lib/actions/company'
import type { FormState, SimpleResult } from '@/lib/actions/company'
import type { CompanySetting } from '@/lib/queries/company'

export function CompanyForm({ setting }: { setting: CompanySetting }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateCompanySetting,
    { status: 'idle' },
  )

  const qrInputRef = useRef<HTMLInputElement>(null)
  const [qrPending, startTransition] = useTransition()
  const [qrResult, setQrResult] = useState<SimpleResult | null>(null)
  const [qrVersion, setQrVersion] = useState(0)
  const [hasQr, setHasQr] = useState(Boolean(setting.upiQrStoredName))

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  async function uploadQr(file: File) {
    setQrResult(null)

    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/company/qr', { method: 'POST', body })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      setQrResult({ ok: false, error: payload?.error ?? 'Upload failed' })
      return
    }

    setHasQr(true)
    setQrVersion((value) => value + 1)
    setQrResult({ ok: true, message: 'QR code updated' })
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
                  defaultValue={setting.companyName}
                  required
                  invalid={Boolean(errors.companyName)}
                />
                {errors.companyName ? (
                  <ErrorMessage>{errors.companyName}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Phone</Label>
                <Input name="phone" defaultValue={setting.phone ?? ''} />
              </Field>
            </div>

            <Field>
              <Label>Address</Label>
              <Textarea
                name="addressLine"
                rows={2}
                defaultValue={setting.addressLine ?? ''}
              />
            </Field>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              <Field>
                <Label>City</Label>
                <Input name="city" defaultValue={setting.city ?? ''} />
              </Field>
              <Field>
                <Label>State</Label>
                <Input name="state" defaultValue={setting.state ?? ''} />
              </Field>
              <Field>
                <Label>Pincode</Label>
                <Input
                  name="pincode"
                  inputMode="numeric"
                  defaultValue={setting.pincode ?? ''}
                  invalid={Boolean(errors.pincode)}
                />
                {errors.pincode ? (
                  <ErrorMessage>{errors.pincode}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Email</Label>
                <Input
                  name="email"
                  type="email"
                  defaultValue={setting.email ?? ''}
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
                  defaultValue={setting.gstin ?? ''}
                  invalid={Boolean(errors.gstin)}
                />
                {errors.gstin ? <ErrorMessage>{errors.gstin}</ErrorMessage> : null}
              </Field>
              <Field>
                <Label>PAN</Label>
                <Input
                  name="pan"
                  className="uppercase"
                  defaultValue={setting.pan ?? ''}
                  invalid={Boolean(errors.pan)}
                />
                {errors.pan ? <ErrorMessage>{errors.pan}</ErrorMessage> : null}
              </Field>
            </div>
          </FieldGroup>
        </Fieldset>

        <Divider />

        <Fieldset>
          <Legend>Bank details</Legend>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Account name</Label>
                <Input
                  name="bankAccountName"
                  defaultValue={setting.bankAccountName ?? ''}
                />
              </Field>
              <Field>
                <Label>Bank name</Label>
                <Input name="bankName" defaultValue={setting.bankName ?? ''} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Field>
                <Label>Account number</Label>
                <Input
                  name="accountNumber"
                  inputMode="numeric"
                  defaultValue={setting.accountNumber ?? ''}
                  invalid={Boolean(errors.accountNumber)}
                />
                {errors.accountNumber ? (
                  <ErrorMessage>{errors.accountNumber}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>IFSC code</Label>
                <Input
                  name="ifscCode"
                  className="uppercase"
                  defaultValue={setting.ifscCode ?? ''}
                  invalid={Boolean(errors.ifscCode)}
                />
                {errors.ifscCode ? (
                  <ErrorMessage>{errors.ifscCode}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Branch</Label>
                <Input name="bankBranch" defaultValue={setting.bankBranch ?? ''} />
              </Field>
            </div>
          </FieldGroup>
        </Fieldset>

        <Divider />

        <Fieldset>
          <Legend>UPI</Legend>
          <FieldGroup>
            <Field>
              <Label>UPI ID</Label>
              <Input
                name="upiId"
                placeholder="madhavcnc@okhdfcbank"
                defaultValue={setting.upiId ?? ''}
                invalid={Boolean(errors.upiId)}
              />
              {errors.upiId ? (
                <ErrorMessage>{errors.upiId}</ErrorMessage>
              ) : (
                <Description>
                  Shown alongside the QR code on invoices.
                </Description>
              )}
            </Field>
          </FieldGroup>
        </Fieldset>

        <Divider />

        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Invoice terms</Label>
              <Textarea
                name="invoiceTerms"
                rows={4}
                defaultValue={setting.invoiceTerms ?? ''}
              />
              <Description>Default terms printed on invoices.</Description>
            </Field>
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
        <Legend>UPI QR code</Legend>

        {qrResult ? (
          <FormBanner tone={qrResult.ok ? 'success' : 'error'}>
            {qrResult.ok ? qrResult.message : qrResult.error}
          </FormBanner>
        ) : null}

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex size-44 items-center justify-center rounded-lg bg-zinc-100 p-2 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
            {hasQr ? (
              <img
                key={qrVersion}
                src={`/api/company/qr?v=${qrVersion}`}
                alt="UPI QR code"
                className="size-full object-contain"
              />
            ) : (
              <Text className="text-center text-xs/5">No QR code uploaded</Text>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Text>
              Upload the QR code from your UPI app. Customers scan it to pay.
            </Text>
            <div className="flex gap-3">
              <Button
                outline
                disabled={qrPending}
                onClick={() => qrInputRef.current?.click()}
              >
                {hasQr ? 'Replace QR code' : 'Upload QR code'}
              </Button>
              {hasQr ? (
                <Button
                  plain
                  disabled={qrPending}
                  onClick={() =>
                    startTransition(async () => {
                      const outcome = await removeUpiQr()
                      setQrResult(outcome)

                      if (outcome.ok) {
                        setHasQr(false)
                        router.refresh()
                      }
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <input
          ref={qrInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]

            if (file) {
              void uploadQr(file)
            }

            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
