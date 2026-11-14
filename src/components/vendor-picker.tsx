'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Combobox, ComboboxLabel, ComboboxOption } from '@/components/catalyst/combobox'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { quickCreateVendor } from '@/lib/actions/vendors'

export type VendorOption = { id: string; name: string; detail: string }
type Choice = VendorOption | { id: '__new__'; name: string; detail: '' }

/**
 * Pick a vendor from the list, or add one on the spot with a phone, city and
 * a description. The chosen vendor's name is reported through onChange.
 */
export function VendorPicker({
  options,
  value,
  onChange,
  disabled,
  placeholder = 'Search or add a vendor',
  className,
}: {
  options: VendorOption[]
  value: string
  onChange: (name: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [list, setList] = useState(options)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [form, setForm] = useState({ contactName: '', phone: '', city: '', gstin: '', description: '' })
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const typed = query.trim()
  const exact = list.some((option) => option.name.toLowerCase() === typed.toLowerCase())
  const choices: Choice[] = [
    ...list,
    ...(typed && !exact ? [{ id: '__new__' as const, name: typed, detail: '' as const }] : []),
  ]
  const selected: Choice | null =
    list.find((option) => option.name === value) ??
    (value ? { id: '__current__', name: value, detail: '' } : null)

  function openAdd(initial: string) {
    setName(initial)
    setForm({ contactName: '', phone: '', city: '', gstin: '', description: '' })
    setError(null)
    setAdding(initial)
  }

  function create() {
    startTransition(async () => {
      const result = await quickCreateVendor({ name, ...form })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setList((current) =>
        [...current, result.vendor].sort((a, b) => a.name.localeCompare(b.name)),
      )
      onChange(result.vendor.name)
      setAdding(null)
    })
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  })

  return (
    <>
      <Combobox<Choice | null>
        options={choices}
        value={selected}
        onChange={(choice) => {
          if (!choice) return onChange('')
          if (choice.id === '__new__') return openAdd(choice.name)
          onChange(choice.name)
        }}
        onQueryChange={setQuery}
        placeholder={placeholder}
        aria-label="Vendor"
        disabled={disabled}
        className={className}
        displayValue={(choice) => choice?.name ?? ''}
        filter={(choice, search) =>
          !choice ||
          choice.id === '__new__' ||
          `${choice.name} ${choice.detail}`.toLowerCase().includes(search.toLowerCase())
        }
      >
        {(choice) => (
          <ComboboxOption value={choice}>
            {choice.id === '__new__' ? (
              <>
                <PlusIcon />
                <ComboboxLabel>Add “{choice.name}” with details…</ComboboxLabel>
              </>
            ) : (
              <>
                <ComboboxLabel>{choice.name}</ComboboxLabel>
                {choice.detail ? (
                  <span className="ml-2 truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {choice.detail}
                  </span>
                ) : null}
              </>
            )}
          </ComboboxOption>
        )}
      </Combobox>

      <Dialog open={adding !== null} onClose={() => !pending && setAdding(null)} size="lg">
        <DialogTitle>New vendor</DialogTitle>
        <DialogDescription>
          Saved to Vendors, so you can pick it again next time. Only the name is required.
        </DialogDescription>
        <DialogBody className="grid gap-4">
          {error ? (
            <div role="alert">
              <FormBanner tone="error">{error}</FormBanner>
            </div>
          ) : null}
          <Field>
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <Label>Contact person</Label>
              <Input {...field('contactName')} />
            </Field>
            <Field>
              <Label>Phone</Label>
              <Input type="tel" {...field('phone')} />
            </Field>
            <Field>
              <Label>City</Label>
              <Input {...field('city')} />
            </Field>
          </div>
          <Field>
            <Label>What they supply</Label>
            <Textarea
              rows={2}
              placeholder="e.g. Edge banding and hardware"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </Field>
          <Field>
            <Label>GSTIN</Label>
            <Input {...field('gstin')} className="uppercase" />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={() => setAdding(null)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : 'Save vendor'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
