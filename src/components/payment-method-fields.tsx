'use client'

import { useId, useState } from 'react'
import { DatePicker } from '@/components/catalyst/date-picker'
import { Description, ErrorMessage, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/catalyst/listbox'
import { checkField, fieldsFor, methodFor, type Direction, type FieldDef } from '@/lib/payment-methods'

/** Reads the JSON a failed submit sends back, so what was typed is not lost. */
export function detailsFromJson(json: string | null | undefined): Record<string, string> {
  if (!json) return {}

  try {
    const parsed: unknown = JSON.parse(json)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

/**
 * The fixed fields of a payment method (UTR for NEFT, cheque number and date
 * for a cheque...). Posts them as one JSON string in a hidden input named
 * `name`; the server validates everything again and derives `reference`.
 * Messages show once a field has been left, and server-side messages (keyed
 * `paymentDetails.<field>`) show until the field is edited.
 */
export function PaymentMethodFields({
  mode,
  direction = 'in',
  defaultValues,
  errors,
  name = 'paymentDetails',
}: {
  /** The payment method: the kind of the chosen payment mode. */
  mode: string | null | undefined
  direction?: Direction
  defaultValues?: Record<string, string>
  /** The form's field errors; keys `paymentDetails.<field>` are shown under their field. */
  errors?: Record<string, string>
  name?: string
}) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues ?? {})
  const [left, setLeft] = useState<Record<string, boolean>>({})
  const [edited, setEdited] = useState<Record<string, boolean>>({})
  const prefix = useId()
  const fields = fieldsFor(mode, direction)
  const method = methodFor(mode)

  if (!method || fields.length === 0) return null

  const posted: Record<string, string> = {}

  for (const field of fields) posted[field.key] = values[field.key] ?? ''

  function set(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
    setEdited((current) => ({ ...current, [key]: true }))
  }

  /** Tidies what was pasted (spaces, case) once the person leaves the field. */
  function settle(field: FieldDef) {
    const checked = checkField(field, values[field.key] ?? '')

    setValues((current) => ({ ...current, [field.key]: checked.value }))
    setLeft((current) => ({ ...current, [field.key]: true }))
  }

  function messageFor(field: FieldDef) {
    const server = errors?.[`${name}.${field.key}`]

    if (server && !edited[field.key]) return server
    if (!left[field.key]) return null

    return checkField(field, values[field.key] ?? '').error
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2" data-payment-method={method.key}>
      <input type="hidden" name={name} value={JSON.stringify(posted)} />

      {fields.map((field) => {
        const message = messageFor(field)
        const id = `${prefix}-${field.key}`
        const value = values[field.key] ?? ''

        return (
          <Field key={field.key}>
            <Label>
              {field.label}
              {field.required ? null : <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>}
            </Label>

            {field.type === 'date' ? (
              <DatePicker
                value={value}
                required={field.required}
                invalid={Boolean(message)}
                aria-label={field.label}
                onChange={(event) => {
                  set(field.key, event.target.value)
                  setLeft((current) => ({ ...current, [field.key]: true }))
                }}
              />
            ) : field.type === 'select' ? (
              <Listbox<string | null>
                value={value || null}
                placeholder="Choose"
                invalid={Boolean(message)}
                aria-label={field.label}
                onChange={(next) => {
                  set(field.key, next ?? '')
                  setLeft((current) => ({ ...current, [field.key]: true }))
                }}
              >
                {field.options?.map((option) => (
                  <ListboxOption key={option.value} value={option.value}>
                    <ListboxLabel>{option.label}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            ) : (
              <Input
                id={id}
                value={value}
                placeholder={field.placeholder}
                maxLength={Math.max(field.maxLength * 2, 40)}
                inputMode={field.inputMode}
                autoComplete="off"
                invalid={Boolean(message)}
                onChange={(event) => set(field.key, event.target.value)}
                onBlur={() => settle(field)}
              />
            )}

            {message ? (
              <ErrorMessage>{message}</ErrorMessage>
            ) : field.help ? (
              <Description>{field.help}</Description>
            ) : null}
          </Field>
        )
      })}
    </div>
  )
}
