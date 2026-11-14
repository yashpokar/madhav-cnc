'use client'

import { useState } from 'react'
import { PlusIcon, UserIcon } from '@heroicons/react/16/solid'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { QuickCustomerDialog, type NewCustomer } from '@/components/quick-customer-dialog'
import type { CustomerOption } from '@/lib/queries/quotations'

/** Who money came from: a customer on file, or any other source by name. */
export type Payer = { customerId?: string; name: string }

type Choice =
  | { kind: 'customer'; id: string; name: string; detail: string }
  | { kind: 'source'; name: string }
  | { kind: 'new-source'; name: string }
  | { kind: 'new-customer'; name: string }

/**
 * Pick who the money came from. A customer becomes a receipt on their account;
 * anything else (owner capital, a refund, cash sale) is kept as a plain
 * source name. Typing an unknown name offers both: add it as a customer with
 * details, or just use it as a source.
 */
export function ReceivedFromPicker({
  customers,
  sources,
  value,
  onChange,
  disabled,
}: {
  customers: CustomerOption[]
  /** Earlier non-customer sources, for quick re-use. */
  sources: string[]
  value: Payer
  onChange: (payer: Payer) => void
  disabled?: boolean
}) {
  const [people, setPeople] = useState(customers)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  const typed = query.trim()
  const known = (name: string) => name.toLowerCase() === typed.toLowerCase()
  const customerNames = new Set(people.map((person) => person.name.toLowerCase()))

  const choices: Choice[] = [
    ...people.map((person) => ({
      kind: 'customer' as const,
      id: person.id,
      name: person.name,
      detail: [person.code, person.phone, person.city].filter(Boolean).join(' · '),
    })),
    ...sources
      .filter((name) => !customerNames.has(name.toLowerCase()))
      .map((name) => ({ kind: 'source' as const, name })),
    ...(typed && !people.some((p) => known(p.name)) && !sources.some(known)
      ? [
          { kind: 'new-customer' as const, name: typed },
          { kind: 'new-source' as const, name: typed },
        ]
      : []),
  ]

  const selected: Choice | null = !value.name
    ? null
    : value.customerId
      ? {
          kind: 'customer',
          id: value.customerId,
          name: value.name,
          detail: '',
        }
      : { kind: 'source', name: value.name }

  function created(customer: NewCustomer) {
    setPeople((current) => [...current, customer])
    onChange({ customerId: customer.id, name: customer.name })
  }

  return (
    <>
      <Combobox<Choice | null>
        options={choices}
        value={selected}
        onChange={(choice) => {
          if (!choice) return onChange({ name: '' })
          if (choice.kind === 'customer') return onChange({ customerId: choice.id, name: choice.name })
          if (choice.kind === 'new-customer') return setAdding(choice.name)
          onChange({ name: choice.name })
        }}
        onQueryChange={setQuery}
        placeholder="Search customer or type a source"
        aria-label="Received from"
        disabled={disabled}
        displayValue={(choice) => choice?.name ?? ''}
        filter={(choice, search) => {
          if (!choice) return true
          if (choice.kind === 'new-customer' || choice.kind === 'new-source') return true
          const detail = choice.kind === 'customer' ? choice.detail : 'other source'

          return `${choice.name} ${detail}`.toLowerCase().includes(search.toLowerCase())
        }}
      >
        {(choice) => (
          <ComboboxOption value={choice}>
            {choice.kind === 'new-customer' ? (
              <>
                <PlusIcon />
                <ComboboxLabel>Add “{choice.name}” as a customer…</ComboboxLabel>
              </>
            ) : choice.kind === 'new-source' ? (
              <>
                <PlusIcon />
                <ComboboxLabel>Use “{choice.name}” as a source (not a customer)</ComboboxLabel>
              </>
            ) : choice.kind === 'customer' ? (
              <>
                <UserIcon />
                <ComboboxLabel>{choice.name}</ComboboxLabel>
                {choice.detail ? <ComboboxDescription>{choice.detail}</ComboboxDescription> : null}
              </>
            ) : (
              <>
                <ComboboxLabel>{choice.name}</ComboboxLabel>
                <ComboboxDescription>Other source</ComboboxDescription>
              </>
            )}
          </ComboboxOption>
        )}
      </Combobox>

      <QuickCustomerDialog
        open={adding !== null}
        onClose={() => setAdding(null)}
        initialName={adding ?? ''}
        onCreated={created}
      />
    </>
  )
}
