'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { saveOpeningBalances } from '@/lib/actions/opening-balances'
import type { SimpleResult } from '@/lib/actions/opening-balances'

type Row = {
  channelId: string
  name: string
  isActive: boolean
  amount: string
  asOf: string
}

export function OpeningBalancesForm({ rows: initial }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState(initial)
  const [result, setResult] = useState<SimpleResult | null>(null)

  function change(channelId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.channelId === channelId ? { ...row, ...patch } : row)),
    )
  }

  function save() {
    startTransition(async () => {
      const outcome = await saveOpeningBalances(
        rows.map(({ channelId, amount, asOf }) => ({ channelId, amount, asOf })),
      )

      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  if (rows.length === 0) {
    return (
      <Text>
        There are no payment modes yet. Add them under Payment modes, then come
        back to enter their opening balances.
      </Text>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <ul className="grid grid-cols-1 gap-4">
        {rows.map((row) => {
          const negative = Number(row.amount) < 0

          return (
            <li
              key={row.channelId}
              className="grid grid-cols-1 gap-4 rounded-lg p-4 ring-1 ring-zinc-950/10 sm:grid-cols-[1fr_1fr_1fr] dark:ring-white/10"
            >
              <div className="flex items-center gap-2 font-medium">
                {row.name}
                {!row.isActive ? <Badge color="zinc">Inactive</Badge> : null}
              </div>
              <Field>
                <Label>Opening balance (use − if negative)</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(event) => change(row.channelId, { amount: event.target.value })}
                  className={negative ? 'text-rose-600 dark:text-rose-400' : undefined}
                />
              </Field>
              <Field>
                <Label>As of</Label>
                <Input
                  type="date"
                  value={row.asOf}
                  onChange={(event) => change(row.channelId, { asOf: event.target.value })}
                />
              </Field>
            </li>
          )
        })}
      </ul>

      <Text>Leave the amount blank to have no opening balance for a mode.</Text>

      <div>
        <Button disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save opening balances'}
        </Button>
      </div>
    </div>
  )
}
