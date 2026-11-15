'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/catalyst/button'
import { Description, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { FormBanner } from '@/components/form-banner'
import { createOwnCompany } from '@/lib/actions/companies'

export function OnboardingForm() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState({ companyName: '', gstin: '', phone: '', city: '' })

  function set(key: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [key]: event.target.value }))
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      // On success the action redirects to the dashboard.
      const result = await createOwnCompany(values)

      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6">
      {error ? <FormBanner tone="error">{error}</FormBanner> : null}
      <FieldGroup>
        <Field>
          <Label>Company name</Label>
          <Input name="companyName" required maxLength={150} value={values.companyName} onChange={set('companyName')} />
        </Field>
        <Field>
          <Label>GSTIN</Label>
          <Input name="gstin" maxLength={15} value={values.gstin} onChange={set('gstin')} />
          <Description>Optional. You can add it later.</Description>
        </Field>
        <Field>
          <Label>Phone</Label>
          <Input type="tel" name="phone" value={values.phone} onChange={set('phone')} />
          <Description>Optional.</Description>
        </Field>
        <Field>
          <Label>City</Label>
          <Input name="city" value={values.city} onChange={set('city')} />
          <Description>Optional.</Description>
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={pending || !values.companyName.trim()}>
        {pending ? 'Creating…' : 'Create company'}
      </Button>
    </form>
  )
}
