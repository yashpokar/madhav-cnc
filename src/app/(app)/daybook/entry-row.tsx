'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickAddCredit, quickAddExpense } from '@/lib/actions/expenses'
import { NumericInput } from '@/components/numeric-input'
import { ReceivedFromPicker, type Payer } from '@/components/received-from-picker'
import { SelectMenu } from '@/components/select-menu'
import type { CustomerOption } from '@/lib/queries/quotations'
import { VendorPicker, type VendorOption } from '@/components/vendor-picker'

const field =
  'h-9 w-full rounded-md bg-white px-2.5 py-1.5 text-sm/6 ring-1 ring-zinc-950/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:bg-zinc-900 dark:ring-white/15'

/**
 * The composer at the foot of a ledger side. Type who and how much, press
 * Enter, and it is saved and ready for the next one. For money spent, a name
 * that is not a known vendor becomes a new vendor (details can be added later
 * under Vendors).
 */
export function EntryRow({
  kind,
  date,
  suggestions,
  vendors = [],
  customers,
  channels,
}: {
  kind: 'credit' | 'debit'
  /** The day this row adds to, YYYY-MM-DD. */
  date: string
  /** Names offered for money received (free text). */
  suggestions: string[]
  /** Vendors to pick from for money spent. */
  vendors?: VendorOption[]
  /** Customers to pick from for money received; omit to type a free-text source. */
  customers?: CustomerOption[]
  /** The business's own payment modes, e.g. HDFC NEFT, SBI UPI, CASH. */
  channels: { id: string; name: string }[]
}) {
  const router = useRouter()
  const listId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [payer, setPayer] = useState<Payer>({ name: '' })
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    if (pending) return
    setError(null)

    startTransition(async () => {
      const result =
        kind === 'debit'
          ? await quickAddExpense({ payeeName: name, amount, channelId, date })
          : await quickAddCredit({
              customerId: payer.customerId,
              sourceName: payer.name,
              amount,
              channelId,
              date,
            })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setName('')
      setPayer({ name: '' })
      setAmount('')
      router.refresh()
      nameRef.current?.focus()
    })
  }

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-950/5 print:hidden dark:bg-white/5 dark:ring-white/10">
      <div className="grid gap-2">
        {kind === 'debit' ? (
          <VendorPicker options={vendors} value={name} onChange={setName} disabled={pending} />
        ) : customers ? (
          <ReceivedFromPicker
            customers={customers}
            sources={suggestions}
            value={payer}
            onChange={setPayer}
            disabled={pending}
          />
        ) : (
          <>
            <input
              ref={nameRef}
              list={listId}
              value={payer.name}
              onChange={(event) => setPayer({ name: event.target.value })}
              onKeyDown={onEnter}
              placeholder="Received from…"
              aria-label="Received from"
              className={field}
              disabled={pending}
            />
            <datalist id={listId}>
              {suggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </>
        )}
        <div className="grid grid-cols-[1fr_9.5rem_auto] gap-2">
          <NumericInput
            inputMode="decimal"
            step="0.01"
            min={0}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={onEnter}
            placeholder="₹ Amount"
            aria-label="Amount"
            className={`${field} text-right tabular-nums`}
            disabled={pending}
          />
          <SelectMenu
            value={channelId}
            onChange={setChannelId}
            aria-label="Payment mode"
            disabled={pending}
            options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm/6 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {pending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-1 pt-1.5 text-xs/5 text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
