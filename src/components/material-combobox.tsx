'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  Combobox,
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
import { ErrorMessage, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { quickCreateMaterial } from '@/lib/actions/items'
import type { MaterialOption } from '@/lib/queries/items'

const NONE_ID = ''
const CREATE_ID = '__create__'

export function MaterialCombobox({
  name,
  options,
  defaultValue,
}: {
  name: string
  options: MaterialOption[]
  defaultValue: string | null
}) {
  const none: MaterialOption = { id: NONE_ID, name: 'No material' }

  const [available, setAvailable] = useState(options)
  const [selected, setSelected] = useState<MaterialOption | null>(
    options.find((option) => option.id === defaultValue) ?? null,
  )
  const [query, setQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmedQuery = query.trim()
  const hasExactMatch = available.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase(),
  )

  const createOption: MaterialOption = {
    id: CREATE_ID,
    name: trimmedQuery ? `Add “${trimmedQuery}”` : 'Add a new material',
  }

  const choices: MaterialOption[] = [
    none,
    ...available,
    ...(hasExactMatch ? [] : [createOption]),
  ]

  function handleChange(option: MaterialOption | null) {
    if (option?.id === CREATE_ID) {
      setDraftName(trimmedQuery)
      setError(null)
      setDialogOpen(true)
      return
    }

    setSelected(option)
  }

  function save() {
    setError(null)

    startTransition(async () => {
      const result = await quickCreateMaterial(draftName)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setAvailable((current) =>
        current.some((option) => option.id === result.material.id)
          ? current
          : [...current, result.material],
      )
      setSelected(result.material)
      setDialogOpen(false)
    })
  }

  return (
    <>
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      <Combobox<MaterialOption | null>
        options={choices}
        value={selected}
        onChange={handleChange}
        onQueryChange={setQuery}
        placeholder="Search materials…"
        displayValue={(option) =>
          option && option.id && option.id !== CREATE_ID ? option.name : ''
        }
        filter={(option, search) => {
          if (!option || option.id === NONE_ID || option.id === CREATE_ID) {
            return true
          }

          return option.name.toLowerCase().includes(search.toLowerCase())
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
              <ComboboxLabel>{option.name}</ComboboxLabel>
            )}
          </ComboboxOption>
        )}
      </Combobox>

      <Dialog open={dialogOpen} onClose={setDialogOpen}>
        <DialogTitle>New material</DialogTitle>
        <DialogDescription>
          Groups items by material type, such as ACP, HDHMR, MDF or Acrylic.
          Saved straight away and selected here.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Material name</Label>
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoFocus
            />
            {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save material'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
