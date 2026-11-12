'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import {
  QuickCustomerDialog,
  type NewCustomer,
} from '@/components/quick-customer-dialog'
import type { CustomerOption } from '@/lib/queries/quotations'

const CREATE_ID = '__create__'

/** Customer picker with an "Add new customer" option at the bottom. */
export function CustomerCombobox({
  options,
  value,
  onChange,
}: {
  options: CustomerOption[]
  value: CustomerOption | null
  onChange: (customer: CustomerOption | null) => void
}) {
  const [available, setAvailable] = useState<CustomerOption[]>(options)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState('')

  const term = query.trim()
  const exact = available.some(
    (option) => option.name.toLowerCase() === term.toLowerCase(),
  )

  const createOption: CustomerOption = {
    id: CREATE_ID,
    code: '',
    name: term ? `Add “${term}” as a new customer` : 'Add a new customer',
    phone: '',
    city: null,
    address: null,
    pincode: null,
    preferredArchitectId: null,
    preferredCarpenterId: null,
  }

  const choices = [...available, ...(exact ? [] : [createOption])]

  function created(customer: NewCustomer) {
    setAvailable((current) => [...current, customer])
    onChange(customer)
  }

  return (
    <>
      <Combobox<CustomerOption | null>
        options={choices}
        value={value}
        onChange={(option) => {
          if (option?.id === CREATE_ID) {
            setDraftName(term)
            setDialogOpen(true)
            return
          }

          onChange(option)
        }}
        onQueryChange={setQuery}
        placeholder="Search customers…"
        displayValue={(option) =>
          option && option.id !== CREATE_ID ? option.name : ''
        }
        filter={(option, search) => {
          if (!option || option.id === CREATE_ID) return true
          const haystack = [option.name, option.code, option.phone, option.city]
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
                <ComboboxDescription>
                  {[option.code, option.phone, option.city]
                    .filter(Boolean)
                    .join(' · ')}
                </ComboboxDescription>
              </>
            )}
          </ComboboxOption>
        )}
      </Combobox>

      <QuickCustomerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialName={draftName}
        onCreated={created}
      />
    </>
  )
}
