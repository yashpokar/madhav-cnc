'use client'

import { useState, useTransition } from 'react'
import { CheckCircleIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { LocalTime } from '@/components/local-time'
import { verifyIntegrity, type VerifyResult } from '@/lib/actions/audit'

/**
 * "Verify integrity": recomputes every hash of this company's audit trail and
 * says whether any event was changed, removed or inserted after the fact.
 */
export function IntegrityPanel({ events, firstAt }: { events: number; firstAt: string | null }) {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      setResult(await verifyIntegrity())
      setCheckedAt(new Date().toISOString())
    })
  }

  const report = result?.ok ? result.report : null

  return (
    <section aria-label="Integrity" className="surface-card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid gap-1">
          <div className="flex items-center gap-2 text-sm/6 font-semibold text-zinc-950 dark:text-white">
            <ShieldCheckIcon aria-hidden="true" className="size-4 text-zinc-500" />
            Integrity
          </div>
          <p className="max-w-prose text-sm/6 text-zinc-500 dark:text-zinc-400">
            Every change is written to a log that the database refuses to edit or delete, and each entry is chained to
            the one before it. Verifying recalculates the whole chain.
            {firstAt ? (
              <>
                {' '}
                {events.toLocaleString('en-IN')} events since <LocalTime value={firstAt} />.
              </>
            ) : null}
          </p>
        </div>
        <Button type="button" outline onClick={run} disabled={pending}>
          {pending ? 'Verifying…' : 'Verify integrity'}
        </Button>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-sm/6 text-red-700 dark:text-red-400">
          {result.error}
        </p>
      ) : null}

      {report ? (
        report.ok ? (
          <div
            role="status"
            className="surface-tinted-good flex items-start gap-2 px-3 py-2 text-sm/6 text-emerald-900 dark:text-emerald-200"
          >
            <CheckCircleIcon aria-hidden="true" className="mt-1 size-4 shrink-0" />
            <div>
              Chain intact: {report.checked.toLocaleString('en-IN')} events checked
              {checkedAt ? (
                <>
                  {' '}
                  at <LocalTime value={checkedAt} />
                </>
              ) : null}
              .
              {report.head ? (
                <div className="mt-0.5 font-mono text-xs/5 break-all opacity-80">
                  Latest #{report.head.seq} · {report.head.hash.slice(0, 16)}…
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div role="alert" className="surface-tinted-bad grid gap-1 px-3 py-2 text-sm/6 text-red-900 dark:text-red-200">
            <div className="flex items-center gap-2 font-medium">
              <ExclamationTriangleIcon aria-hidden="true" className="size-4" />
              The chain is broken: the audit trail was changed outside the application.
            </div>
            <ul className="list-disc pl-6">
              {report.breaks.map((item) => (
                <li key={`${item.seq}-${item.kind}`}>{item.message}</li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </section>
  )
}
