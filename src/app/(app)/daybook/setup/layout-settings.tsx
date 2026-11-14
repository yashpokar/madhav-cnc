'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { FormBanner } from '@/components/form-banner'
import { saveDaybookLayout } from '@/lib/actions/tally'
import type { DaybookLayout } from '@/lib/daybook-layout'
import type { SimpleResult } from '@/lib/actions/quotations'

const pick =
  'rounded-md border border-zinc-950/10 bg-transparent px-2 py-1.5 text-sm/6 dark:border-white/15 dark:bg-zinc-900'

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        className="mt-1 size-4 rounded border-zinc-400 accent-blue-600"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm/6">
        {label}
        {hint ? <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">{hint}</span> : null}
      </span>
    </label>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
      {label}
      {children}
    </label>
  )
}

/** The look of the day book: density, sides, and the counting area's sections and wording. */
export function LayoutSettings({ layout }: { layout: DaybookLayout }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [draft, setDraft] = useState<DaybookLayout>(layout)
  const tally = draft.tally
  const setTally = (changes: Partial<DaybookLayout['tally']>) =>
    setDraft((current) => ({ ...current, tally: { ...current.tally, ...changes } }))

  function save() {
    startTransition(async () => {
      const outcome = await saveDaybookLayout(draft)
      setResult(outcome)
      if (outcome.ok) router.refresh()
    })
  }

  return (
    <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      <h2 className="border-b border-zinc-950/10 px-3 py-2.5 text-sm/6 font-semibold dark:border-white/10">
        Layout
      </h2>
      <div className="grid gap-6 p-3">
        {result ? (
          <FormBanner tone={result.ok ? 'success' : 'error'}>
            {result.ok ? result.message : result.error}
          </FormBanner>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled label="Density">
            <select
              className={pick}
              value={draft.density}
              onChange={(event) =>
                setDraft({ ...draft, density: event.target.value as DaybookLayout['density'] })
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact (more rows on screen)</option>
            </select>
          </Labelled>
          <Labelled label="Credit and Debit">
            <select
              className={pick}
              value={draft.sides}
              onChange={(event) =>
                setDraft({ ...draft, sides: event.target.value as DaybookLayout['sides'] })
              }
            >
              <option value="side-by-side">Side by side</option>
              <option value="stacked">One above the other</option>
            </select>
          </Labelled>
        </div>

        <div>
          <Toggle
            label="Show “Brought forward” at the top of each day"
            checked={draft.showBroughtForward}
            onChange={(next) => setDraft({ ...draft, showBroughtForward: next })}
          />
          <Toggle
            label="Show “Carried forward” at the bottom of each day"
            checked={draft.showCarriedForward}
            onChange={(next) => setDraft({ ...draft, showCarriedForward: next })}
          />
        </div>

        <div className="grid gap-3 border-t border-zinc-950/5 pt-4 dark:border-white/10">
          <h3 className="text-sm/6 font-semibold">Counting area</h3>
          <Toggle
            label="Show the counting area under each day"
            hint="Turn off if you do not count cash and banks here."
            checked={tally.show}
            onChange={(next) => setTally({ show: next })}
          />
          {tally.show ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Labelled label="Order">
                  <select
                    className={pick}
                    value={tally.order}
                    onChange={(event) =>
                      setTally({ order: event.target.value as DaybookLayout['tally']['order'] })
                    }
                  >
                    <option value="banks-first">Banks, then notes</option>
                    <option value="notes-first">Notes, then banks</option>
                  </select>
                </Labelled>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <Toggle label="Bank rows" checked={tally.showBanks} onChange={(next) => setTally({ showBanks: next })} />
                <Toggle label="Note rows" checked={tally.showNotes} onChange={(next) => setTally({ showNotes: next })} />
                <Toggle label="Count column" checked={tally.showCount} onChange={(next) => setTally({ showCount: next })} />
                <Toggle label="Grand total row" checked={tally.showTotal} onChange={(next) => setTally({ showTotal: next })} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {(
                  [
                    ['titleLabel', 'Heading'],
                    ['modeLabel', 'First column'],
                    ['countLabel', 'Count column'],
                    ['amountLabel', 'Amount column'],
                    ['totalLabel', 'Total row'],
                  ] as const
                ).map(([key, label]) => (
                  <Labelled key={key} label={label}>
                    <Input
                      value={tally[key]}
                      maxLength={40}
                      onChange={(event) => setTally({ [key]: event.target.value })}
                    />
                  </Labelled>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save layout'}
          </Button>
        </div>
      </div>
    </section>
  )
}
