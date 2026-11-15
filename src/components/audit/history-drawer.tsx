'use client'

import { useState, useTransition } from 'react'
import * as Headless from '@headlessui/react'
import { ClockIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { AuditEvent } from '@/components/audit/audit-event'
import { Button } from '@/components/catalyst/button'
import { FormBanner } from '@/components/form-banner'
import { loadHistory } from '@/lib/actions/audit'
import type { HistoryEntry } from '@/lib/audit-trail/present'

/**
 * A "History" button that opens a side panel with every change ever made to one
 * record: who, when, from where (web, app, API, system) and what changed, field
 * by field. `model` is the audited model name (e.g. "Invoice").
 */
export function HistoryDrawer({
  model,
  id,
  title = 'History',
  label = 'History',
  plain = false,
}: {
  model: string
  id: string
  title?: string
  label?: string
  plain?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function show() {
    setOpen(true)
    setError(null)

    startTransition(async () => {
      const result = await loadHistory(model, id)

      if (result.ok) setEntries(result.entries)
      else setError(result.error)
    })
  }

  return (
    <>
      <Button type="button" {...(plain ? { plain: true } : { outline: true })} onClick={show} aria-label="Show the history of this record">
        <ClockIcon />
        {label}
      </Button>

      <Headless.Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 bg-zinc-950/30 backdrop-blur-sm transition duration-150 data-closed:opacity-0 dark:bg-zinc-950/60"
        />
        <div className="fixed inset-0 flex justify-end">
          <Headless.DialogPanel
            transition
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-pop ring-1 ring-zinc-950/5 transition duration-200 ease-out data-closed:translate-x-8 data-closed:opacity-0 sm:rounded-l-2xl dark:bg-zinc-900 dark:shadow-none dark:ring-white/10"
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-950/5 px-5 py-4 dark:border-white/10">
              <div className="grid gap-0.5">
                <Headless.DialogTitle className="text-base/6 font-semibold text-zinc-950 dark:text-white">
                  {title}
                </Headless.DialogTitle>
                <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
                  Every change to this record, newest first. This list can not be edited.
                </p>
              </div>
              <Button type="button" plain aria-label="Close history" onClick={() => setOpen(false)}>
                <XMarkIcon />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error ? (
                <div role="alert">
                  <FormBanner tone="error">{error}</FormBanner>
                </div>
              ) : entries === null || pending ? (
                <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="surface-inset px-3 py-4 text-sm/6 text-zinc-500 dark:text-zinc-400">
                  Nothing recorded for this record yet. Changes from now on will appear here.
                </p>
              ) : (
                <ol className="ml-2 grid gap-0 border-l border-zinc-950/10 pl-5 dark:border-white/10">
                  {entries.map((entry) => (
                    <li key={entry.id} className="relative pb-5 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute top-2 -left-[1.5625rem] size-2 rounded-full bg-zinc-950 ring-4 ring-white dark:bg-white dark:ring-zinc-900"
                      />
                      <AuditEvent entry={entry} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Headless.DialogPanel>
        </div>
      </Headless.Dialog>
    </>
  )
}
