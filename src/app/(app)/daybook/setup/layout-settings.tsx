'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { FormBanner } from '@/components/form-banner'
import { saveDaybookLayout } from '@/lib/actions/tally'
import type { DaybookLayout } from '@/lib/daybook-layout'
import type { SimpleResult } from '@/lib/actions/quotations'

/** A two-or-three way choice drawn as cards, saved the moment it is picked. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; title: string; hint: string }[]
  onChange: (next: T) => void
  disabled: boolean
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm/6 font-medium">{label}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-xl px-4 py-3 text-left ring-1 transition disabled:opacity-60',
              value === option.value
                ? 'bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-400/10'
                : 'ring-zinc-950/10 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-white/5',
            )}
          >
            <span className="block text-sm/6 font-medium">{option.title}</span>
            <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">{option.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** How the day book looks. Each choice saves straight away. */
export function LayoutSettings({ layout }: { layout: DaybookLayout }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [draft, setDraft] = useState<DaybookLayout>(layout)

  function save(next: DaybookLayout) {
    setDraft(next)
    startTransition(async () => {
      const outcome = await saveDaybookLayout(next)
      setResult(outcome)
      if (outcome.ok) router.refresh()
    })
  }

  return (
    <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      <h2 className="border-b border-zinc-950/10 px-3 py-2.5 text-sm/6 font-semibold dark:border-white/10">
        Layout
      </h2>
      <div className="grid gap-6 p-4">
        {result && !result.ok ? <FormBanner tone="error">{result.error}</FormBanner> : null}

        <Choice
          label="Spacing"
          value={draft.density}
          disabled={pending}
          onChange={(density) => save({ ...draft, density })}
          options={[
            { value: 'comfortable', title: 'Comfortable', hint: 'Roomy rows, easy to scan' },
            { value: 'compact', title: 'Compact', hint: 'More entries on screen' },
          ]}
        />
        <Choice
          label="Credit and Debit"
          value={draft.sides}
          disabled={pending}
          onChange={(sides) => save({ ...draft, sides })}
          options={[
            { value: 'side-by-side', title: 'Side by side', hint: 'Like the paper sheet' },
            { value: 'stacked', title: 'One above the other', hint: 'Better on small screens' },
          ]}
        />
        <Choice
          label="Counting area"
          value={draft.tally.show ? draft.tally.order : 'hidden'}
          disabled={pending}
          onChange={(choice) =>
            save({
              ...draft,
              tally:
                choice === 'hidden'
                  ? { ...draft.tally, show: false }
                  : { show: true, order: choice },
            })
          }
          options={[
            { value: 'banks-first', title: 'Banks, then notes', hint: 'Bank balances on top' },
            { value: 'notes-first', title: 'Notes, then banks', hint: 'Cash count on top' },
            { value: 'hidden', title: 'Hide it', hint: 'If you do not count cash here' },
          ]}
        />

        <p className="text-xs/5 text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
          {pending ? 'Saving…' : result?.ok ? 'Saved.' : 'Changes save as you pick them.'}
        </p>
      </div>
    </section>
  )
}
