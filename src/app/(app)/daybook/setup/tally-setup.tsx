'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import {
  createBankAccount,
  createChannel,
  createDenomination,
  deleteBankAccount,
  deleteChannel,
  deleteDenomination,
  renameBankAccount,
  setBankAccountActive,
  setChannelActive,
  setDenominationActive,
  updateChannel,
} from '@/lib/actions/tally'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { PaymentMode } from '@/generated/prisma/enums'
import type { SimpleResult } from '@/lib/actions/quotations'

type Bank = { id: string; name: string; isActive: boolean }
type Note = { id: string; value: number; isActive: boolean }
type Channel = {
  id: string
  name: string
  mode: PaymentMode
  bankAccountId: string | null
  isActive: boolean
}

const pick =
  'rounded-md border border-zinc-950/10 bg-transparent px-2 py-1.5 text-sm/6 dark:border-white/15 dark:bg-zinc-900'

const row =
  'flex flex-wrap items-center gap-3 border-b border-zinc-950/5 px-3 py-2 last:border-b-0 dark:border-white/10'

function Shown({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
  disabled: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm/6 text-zinc-600 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="size-4 rounded border-zinc-400 accent-blue-600"
        onChange={(event) => onChange(event.target.checked)}
      />
      Shown
    </label>
  )
}

export function TallySetup({
  banks,
  notes,
  channels,
  canDelete,
}: {
  banks: Bank[]
  notes: Note[]
  channels: Channel[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [newBank, setNewBank] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [newMode, setNewMode] = useState<PaymentMode>('BANK_TRANSFER')
  const [newBankId, setNewBankId] = useState('')
  const [channelNames, setChannelNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(channels.map((c) => [c.id, c.name])),
  )
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(banks.map((b) => [b.id, b.name])),
  )

  function run(action: () => Promise<SimpleResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        after?.()
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
        <h2 className="border-b border-zinc-950/10 px-3 py-2.5 text-sm/6 font-semibold dark:border-white/10">
          Payment modes
        </h2>
        <p className="px-3 pt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          The names offered in the day book&apos;s Payment mode column, such as HDFC NEFT, SBI UPI
          or CASH. Each is a kind of payment, optionally through one of your bank accounts.
        </p>
        <ul>
          {channels.map((channel) => (
            <li key={channel.id} className={row}>
              <Input
                aria-label="Payment mode name"
                value={channelNames[channel.id] ?? channel.name}
                disabled={pending}
                className="max-w-48"
                onChange={(event) =>
                  setChannelNames((c) => ({ ...c, [channel.id]: event.target.value }))
                }
                onBlur={() => {
                  const next = (channelNames[channel.id] ?? '').trim()

                  if (next && next !== channel.name) {
                    run(() =>
                      updateChannel(channel.id, {
                        name: next,
                        mode: channel.mode,
                        bankAccountId: channel.bankAccountId,
                      }),
                    )
                  }
                }}
              />
              <select
                aria-label={`Kind of payment for ${channel.name}`}
                value={channel.mode}
                disabled={pending}
                className={pick}
                onChange={(event) =>
                  run(() =>
                    updateChannel(channel.id, {
                      name: channel.name,
                      mode: event.target.value,
                      bankAccountId: event.target.value === 'CASH' ? null : channel.bankAccountId,
                    }),
                  )
                }
              >
                {Object.values(PaymentMode).map((mode) => (
                  <option key={mode} value={mode}>
                    {PAYMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Bank account for ${channel.name}`}
                value={channel.bankAccountId ?? ''}
                disabled={pending || channel.mode === 'CASH'}
                className={pick}
                onChange={(event) =>
                  run(() =>
                    updateChannel(channel.id, {
                      name: channel.name,
                      mode: channel.mode,
                      bankAccountId: event.target.value || null,
                    }),
                  )
                }
              >
                <option value="">
                  {channel.mode === 'CASH' ? 'No bank (cash)' : 'No bank account'}
                </option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
              <Shown
                checked={channel.isActive}
                label={`Show ${channel.name}`}
                disabled={pending}
                onChange={(next) => run(() => setChannelActive(channel.id, next))}
              />
              {canDelete ? (
                <ConfirmButton
                  outline={false}
                  label={`Delete ${channel.name}`}
                  title={`Delete ${channel.name}?`}
                  description="Entries that used it keep their kind of payment but lose this name. Hide it instead to keep the name."
                  confirmLabel="Delete"
                  action={() => deleteChannel(channel.id)}
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">Delete</span>
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-center gap-2 border-t border-zinc-950/10 p-3 dark:border-white/10"
          onSubmit={(event) => {
            event.preventDefault()
            run(
              () =>
                createChannel({
                  name: newChannel,
                  mode: newMode,
                  bankAccountId: newMode === 'CASH' ? null : newBankId || null,
                }),
              () => setNewChannel(''),
            )
          }}
        >
          <Input
            aria-label="New payment mode"
            placeholder="New mode, e.g. ICICI RTGS"
            value={newChannel}
            className="max-w-48"
            onChange={(event) => setNewChannel(event.target.value)}
          />
          <select
            aria-label="Kind of payment"
            value={newMode}
            className={pick}
            onChange={(event) => setNewMode(event.target.value as PaymentMode)}
          >
            {Object.values(PaymentMode).map((mode) => (
              <option key={mode} value={mode}>
                {PAYMENT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <select
            aria-label="Bank account"
            value={newMode === 'CASH' ? '' : newBankId}
            disabled={newMode === 'CASH'}
            className={pick}
            onChange={(event) => setNewBankId(event.target.value)}
          >
            <option value="">No bank account</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending || !newChannel.trim()}>
            Add payment mode
          </Button>
        </form>
      </section>

      <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
        <h2 className="border-b border-zinc-950/10 px-3 py-2.5 text-sm/6 font-semibold dark:border-white/10">
          Bank accounts
        </h2>
        <ul>
          {banks.map((bank) => (
            <li key={bank.id} className={row}>
              <Input
                aria-label="Bank account name"
                value={names[bank.id] ?? bank.name}
                disabled={pending}
                className="max-w-64"
                onChange={(event) => setNames((c) => ({ ...c, [bank.id]: event.target.value }))}
                onBlur={() => {
                  const next = (names[bank.id] ?? '').trim()

                  if (next && next !== bank.name) run(() => renameBankAccount(bank.id, next))
                }}
              />
              <Shown
                checked={bank.isActive}
                label={`Show ${bank.name}`}
                disabled={pending}
                onChange={(next) => run(() => setBankAccountActive(bank.id, next))}
              />
              {canDelete ? (
                <ConfirmButton
                  outline={false}
                  label={`Delete ${bank.name}`}
                  title={`Delete ${bank.name}?`}
                  description="Its balances on every past day are removed too. Hide it instead to keep them."
                  confirmLabel="Delete"
                  action={() => deleteBankAccount(bank.id)}
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">Delete</span>
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-center gap-2 border-t border-zinc-950/10 p-3 dark:border-white/10"
          onSubmit={(event) => {
            event.preventDefault()
            run(
              () => createBankAccount(newBank),
              () => setNewBank(''),
            )
          }}
        >
          <Input
            aria-label="New bank account"
            placeholder="New bank account, e.g. ICICI"
            value={newBank}
            className="max-w-64"
            onChange={(event) => setNewBank(event.target.value)}
          />
          <Button type="submit" disabled={pending || !newBank.trim()}>
            Add bank
          </Button>
        </form>
      </section>

      <section className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
        <h2 className="border-b border-zinc-950/10 px-3 py-2.5 text-sm/6 font-semibold dark:border-white/10">
          Note denominations
        </h2>
        <ul>
          {notes.map((note) => (
            <li key={note.id} className={row}>
              <span className="w-24 text-sm/6 font-medium tabular-nums">₹{note.value}</span>
              <Shown
                checked={note.isActive}
                label={`Show ₹${note.value}`}
                disabled={pending}
                onChange={(next) => run(() => setDenominationActive(note.id, next))}
              />
              {canDelete ? (
                <ConfirmButton
                  outline={false}
                  label={`Delete ₹${note.value}`}
                  title={`Delete ₹${note.value}?`}
                  description="Counts of this note on every past day are removed too. Hide it instead to keep them."
                  confirmLabel="Delete"
                  action={() => deleteDenomination(note.id)}
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">Delete</span>
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-center gap-2 border-t border-zinc-950/10 p-3 dark:border-white/10"
          onSubmit={(event) => {
            event.preventDefault()
            run(
              () => createDenomination(Number(newNote)),
              () => setNewNote(''),
            )
          }}
        >
          <Input
            aria-label="New denomination"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="New note, e.g. 5"
            value={newNote}
            className="max-w-48"
            onChange={(event) => setNewNote(event.target.value)}
          />
          <Button type="submit" disabled={pending || !newNote.trim()}>
            Add note
          </Button>
        </form>
      </section>
    </div>
  )
}
