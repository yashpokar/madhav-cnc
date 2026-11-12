'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickAddCredit, quickAddExpense } from '@/lib/actions/expenses'

const cell =
  'w-full bg-transparent px-2 py-1.5 text-sm/6 outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-400/10'

/**
 * The last row of a ledger side, typed into like a spreadsheet row: Tab moves
 * between cells, Enter saves and returns to the first cell for the next entry.
 */
export function EntryRow({
  kind,
  date,
  suggestions,
  channels,
}: {
  kind: 'credit' | 'debit'
  /** The day this row adds to, YYYY-MM-DD. */
  date: string
  suggestions: string[]
  /** The business's own payment modes, e.g. HDFC NEFT, SBI UPI, CASH. */
  channels: { id: string; name: string }[]
}) {
  const router = useRouter()
  const listId = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
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
          : await quickAddCredit({ sourceName: name, amount, channelId, date })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setName('')
      setAmount('')
      router.refresh()
      amountRef.current?.focus()
    })
  }

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  const label = kind === 'debit' ? 'Paid to' : 'Received from'

  return (
    <>
      <tr className="bg-blue-50/50 print:hidden dark:bg-blue-400/5">
        <td className="border border-zinc-400 px-2 text-center text-xs/5 text-zinc-400 dark:border-white/30">
          new
        </td>
        <td className="border border-zinc-400 p-0 dark:border-white/30">
          <input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={onEnter}
            placeholder="0.00"
            aria-label="Amount"
            className={`${cell} text-right tabular-nums`}
            disabled={pending}
          />
        </td>
        <td className="border border-zinc-400 p-0 dark:border-white/30">
          <input
            list={listId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onEnter}
            placeholder={`${label}… (type to add)`}
            aria-label="Description"
            className={cell}
            disabled={pending}
          />
          <datalist id={listId}>
            {suggestions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </td>
        <td className="border border-zinc-400 p-0 dark:border-white/30">
          <select
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            onKeyDown={onEnter}
            aria-label="Payment mode"
            className={cell}
            disabled={pending}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-1 text-center print:hidden">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded px-2 py-1 text-xs/5 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
          >
            {pending ? '…' : 'Add'}
          </button>
        </td>
      </tr>
      {error ? (
        <tr role="alert">
          <td
            colSpan={5}
            className="border border-red-300 bg-red-50 px-3 py-1.5 text-xs/5 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
          >
            {error}
          </td>
        </tr>
      ) : null}
    </>
  )
}
