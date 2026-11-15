'use client'

import { Description, Field, Label } from '@/components/catalyst/fieldset'
import { Textarea } from '@/components/catalyst/textarea'

export const MIN_REASON = 3

/** Whether a typed reason is long enough to send. */
export const reasonOk = (value: string) => value.trim().length >= MIN_REASON

/**
 * The "why" box on a destructive action. The answer is kept, with the full
 * record, in the audit trail. Shown in delete / reverse dialogs.
 */
export function ReasonField({
  value,
  onChange,
  required = true,
  label = 'Reason',
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  label?: string
  disabled?: boolean
}) {
  return (
    <Field className="mt-5">
      <Label>
        {label}
        {required ? null : <span className="font-normal text-zinc-500 dark:text-zinc-400"> (optional)</span>}
      </Label>
      <Textarea
        rows={2}
        value={value}
        disabled={disabled}
        maxLength={500}
        placeholder="e.g. Entered twice by mistake"
        onChange={(event) => onChange(event.target.value)}
      />
      <Description>Kept in the audit trail with a full copy of what was removed.</Description>
    </Field>
  )
}
