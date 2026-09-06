'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
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
import { quickCreatePartner } from '@/lib/actions/partners'
import type { PartnerOption } from '@/lib/queries/partners'
import type { PartnerType } from '@/generated/prisma/enums'

const NONE_ID = ''
const CREATE_ID = '__create__'

function secondaryLine(partner: PartnerOption) {
  return [partner.firmName, partner.city].filter(Boolean).join(' · ')
}

export function PartnerCombobox({
  name,
  type,
  options,
  defaultValue,
  placeholder,
  noneLabel,
}: {
  name: string
  type: PartnerType
  options: PartnerOption[]
  defaultValue: string | null
  placeholder: string
  noneLabel?: string
}) {
  const typeLabel = type === 'ARCHITECT' ? 'architect' : 'carpenter'

  const none: PartnerOption = {
    id: NONE_ID,
    code: '',
    name: noneLabel ?? `No preferred ${typeLabel}`,
    firmName: null,
    city: null,
  }

  const [available, setAvailable] = useState<PartnerOption[]>(options)
  const [selected, setSelected] = useState<PartnerOption | null>(
    options.find((option) => option.id === defaultValue) ?? null,
  )
  const [query, setQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftFirm, setDraftFirm] = useState('')
  const [draftCity, setDraftCity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmedQuery = query.trim()
  const hasExactMatch = available.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase(),
  )

  const createOption: PartnerOption = {
    id: CREATE_ID,
    code: '',
    name: trimmedQuery ? `Add “${trimmedQuery}”` : `Add a new ${typeLabel}`,
    firmName: null,
    city: null,
  }

  const choices: PartnerOption[] = [
    none,
    ...available,
    ...(hasExactMatch ? [] : [createOption]),
  ]

  function openDialog() {
    setDraftName(trimmedQuery)
    setDraftPhone('')
    setDraftFirm('')
    setDraftCity('')
    setError(null)
    setDialogOpen(true)
  }

  function handleChange(option: PartnerOption | null) {
    if (option?.id === CREATE_ID) {
      openDialog()
      return
    }

    setSelected(option)
  }

  function save() {
    setError(null)

    startTransition(async () => {
      const result = await quickCreatePartner({
        type,
        name: draftName,
        phone: draftPhone,
        firmName: draftFirm,
        city: draftCity,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setAvailable((current) => [...current, result.partner])
      setSelected(result.partner)
      setDialogOpen(false)
    })
  }

  return (
    <>
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      <Combobox<PartnerOption | null>
        options={choices}
        value={selected}
        onChange={handleChange}
        onQueryChange={setQuery}
        placeholder={placeholder}
        displayValue={(option) =>
          option && option.id && option.id !== CREATE_ID ? option.name : ''
        }
        filter={(option, search) => {
          if (!option || option.id === NONE_ID || option.id === CREATE_ID) {
            return true
          }

          const haystack = [option.name, option.firmName, option.city, option.code]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          return haystack.includes(search.toLowerCase())
        }}
      >
        {(option) => (
          <ComboboxOption value={option}>
            {option.id === CREATE_ID ? (
              <>
                <PlusIcon />
                <ComboboxLabel>{option.name}</ComboboxLabel>
              </>
            ) : (
              <>
                <ComboboxLabel>{option.name}</ComboboxLabel>
                {option.id && secondaryLine(option) ? (
                  <ComboboxDescription>
                    {secondaryLine(option)}
                  </ComboboxDescription>
                ) : null}
              </>
            )}
          </ComboboxOption>
        )}
      </Combobox>

      <Dialog open={dialogOpen} onClose={setDialogOpen}>
        <DialogTitle>
          New {typeLabel}
        </DialogTitle>
        <DialogDescription>
          Saved to the master list straight away and selected here. You can fill
          in the rest later.
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Name</Label>
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <Label>Phone</Label>
              <Input
                type="tel"
                value={draftPhone}
                onChange={(event) => setDraftPhone(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Firm name</Label>
              <Input
                value={draftFirm}
                onChange={(event) => setDraftFirm(event.target.value)}
              />
            </Field>
            <Field>
              <Label>City</Label>
              <Input
                value={draftCity}
                onChange={(event) => setDraftCity(event.target.value)}
              />
              {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? 'Saving…' : `Save ${typeLabel}`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
