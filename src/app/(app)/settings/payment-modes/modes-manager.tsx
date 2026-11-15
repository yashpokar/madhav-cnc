'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox'
import { Description, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import {
  addPaymentMode,
  deletePaymentMode,
  movePaymentMode,
  setPaymentModeActive,
  updatePaymentMode,
} from '@/lib/actions/payment-modes'
import type { PaymentMode } from '@/generated/prisma/enums'

type Detail = { label: string; value: string }

type Mode = {
  id: string
  name: string
  kind: PaymentMode
  isActive: boolean
  used: number
  details: Detail[]
  showOnDocuments: boolean
  hasQr: boolean
}

const KINDS = Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]

const SUGGESTIONS = ['Account name', 'Bank name', 'Branch', 'Account number', 'IFSC', 'UPI ID']

type Notice = { ok: boolean; text: string } | null

export function ModesManager({ modes }: { modes: Mode[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function run(task: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) {
    startTransition(async () => {
      const result = await task()

      setNotice({
        ok: result.ok,
        text: (result.ok ? result.message : result.error) ?? '',
      })

      if (result.ok) {
        after?.()
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {notice ? (
        <FormBanner tone={notice.ok ? 'success' : 'error'}>{notice.text}</FormBanner>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Subheading level={2}>Your modes</Subheading>
        <Button
          onClick={() => {
            setAdding((value) => !value)
            setOpenId(null)
          }}
        >
          <PlusIcon data-slot="icon" />
          Add mode
        </Button>
      </div>

      {adding ? (
        <ModeEditor
          key="new"
          pending={pending}
          submitLabel="Add mode"
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            run(() => addPaymentMode(input), () => setAdding(false))
          }
        />
      ) : null}

      <ul className="divide-y divide-zinc-950/5 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/10 dark:divide-white/10 dark:bg-zinc-900 dark:ring-white/10">
        {modes.map((mode, index) => {
          const open = openId === mode.id

          return (
            <li key={mode.id} className={mode.isActive ? '' : 'bg-zinc-50 dark:bg-white/[0.02]'}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${mode.name} up`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => movePaymentMode(mode.id, 'up'))}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-950 disabled:opacity-30 dark:hover:text-white"
                  >
                    <ArrowUpIcon className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${mode.name} down`}
                    disabled={pending || index === modes.length - 1}
                    onClick={() => run(() => movePaymentMode(mode.id, 'down'))}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-950 disabled:opacity-30 dark:hover:text-white"
                  >
                    <ArrowDownIcon className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${mode.isActive ? '' : 'text-zinc-500'}`}>{mode.name}</span>
                    <Badge>{PAYMENT_MODE_LABELS[mode.kind]}</Badge>
                    {mode.isActive ? null : <Badge color="amber">Hidden</Badge>}
                    {mode.showOnDocuments ? <Badge color="lime">On invoices</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {mode.used === 0 ? 'Not used yet' : `Used on ${mode.used} record${mode.used === 1 ? '' : 's'}`}
                    {mode.details.length > 0
                      ? ` · ${mode.details.length} detail${mode.details.length === 1 ? '' : 's'}`
                      : ''}
                    {mode.hasQr ? ' · QR code' : ''}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    outline
                    disabled={pending}
                    onClick={() => {
                      setOpenId(open ? null : mode.id)
                      setAdding(false)
                    }}
                  >
                    {open ? 'Close' : 'Edit'}
                  </Button>
                  <Button
                    plain
                    disabled={pending}
                    onClick={() =>
                      run(() => setPaymentModeActive(mode.id, !mode.isActive))
                    }
                  >
                    {mode.isActive ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </div>

              {open ? (
                <div className="border-t border-zinc-950/5 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                  <ModeEditor
                    key={mode.id}
                    mode={mode}
                    pending={pending}
                    submitLabel="Save changes"
                    onCancel={() => setOpenId(null)}
                    onSubmit={(input) => run(() => updatePaymentMode(mode.id, input))}
                    onDelete={() =>
                      run(() => deletePaymentMode(mode.id), () => setOpenId(null))
                    }
                    onQrChanged={(text) => {
                      setNotice({ ok: true, text })
                      router.refresh()
                    }}
                    onQrError={(text) => setNotice({ ok: false, text })}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ModeEditor({
  mode,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  onQrChanged,
  onQrError,
}: {
  mode?: Mode
  pending: boolean
  submitLabel: string
  onSubmit: (input: {
    name: string
    kind: string
    details: Detail[]
    showOnDocuments: boolean
  }) => void
  onCancel: () => void
  onDelete?: () => void
  onQrChanged?: (message: string) => void
  onQrError?: (message: string) => void
}) {
  const [name, setName] = useState(mode?.name ?? '')
  const [kind, setKind] = useState<string>(mode?.kind ?? 'BANK_TRANSFER')
  const [details, setDetails] = useState<Detail[]>(mode?.details ?? [])
  const [show, setShow] = useState(mode?.showOnDocuments ?? false)

  const labels = new Set(details.map((row) => row.label.trim().toLowerCase()))

  function setRow(index: number, patch: Partial<Detail>) {
    setDetails((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="grid grid-cols-1 gap-5 rounded-xl p-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <Label>Name</Label>
          <Input
            value={name}
            placeholder="e.g. HDFC current account"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <Label>Kind</Label>
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_MODE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <div className="text-sm/6 font-medium">Details</div>
          <Text>Anything customers need to pay you this way. Add as many rows as you like.</Text>
        </div>

        {details.map((row, index) => (
          <div key={index} className="flex items-start gap-2">
            <Input
              className="min-w-0 flex-1"
              aria-label="Label"
              placeholder="Label"
              value={row.label}
              onChange={(event) => setRow(index, { label: event.target.value })}
            />
            <Input
              className="min-w-0 flex-[2]"
              aria-label="Value"
              placeholder="Value"
              value={row.value}
              onChange={(event) => setRow(index, { value: event.target.value })}
            />
            <Button
              plain
              aria-label="Remove this detail"
              onClick={() => setDetails((rows) => rows.filter((_, i) => i !== index))}
            >
              <XMarkIcon data-slot="icon" />
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button outline onClick={() => setDetails((rows) => [...rows, { label: '', value: '' }])}>
            <PlusIcon data-slot="icon" />
            Add detail
          </Button>
          {SUGGESTIONS.filter((label) => !labels.has(label.toLowerCase())).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setDetails((rows) => [...rows, { label, value: '' }])}
              className="rounded-full px-2.5 py-1 text-xs/4 text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5"
            >
              + {label}
            </button>
          ))}
        </div>
      </div>

      <CheckboxField>
        <Checkbox checked={show} onChange={setShow} />
        <Label>Show on invoices and quotations</Label>
        <Description>
          Prints this mode, its details and QR code under Payment, so customers can pay you.
        </Description>
      </CheckboxField>

      {mode ? (
        <QrSlot
          modeId={mode.id}
          hasQr={mode.hasQr}
          onChanged={(text) => onQrChanged?.(text)}
          onError={(text) => onQrError?.(text)}
        />
      ) : (
        <Text>Save the mode first, then you can upload a QR code for it.</Text>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            disabled={pending || !name.trim()}
            onClick={() => onSubmit({ name, kind, details, showOnDocuments: show })}
          >
            {pending ? 'Saving…' : submitLabel}
          </Button>
          <Button plain disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {onDelete ? (
          <div className="flex items-center gap-3">
            {mode && mode.used > 0 ? (
              <span className="text-xs/5 text-zinc-500">Used, so it can only be hidden.</span>
            ) : null}
            <Button
              plain
              disabled={pending}
              onClick={onDelete}
              className="text-red-600 dark:text-red-400"
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function QrSlot({
  modeId,
  hasQr,
  onChanged,
  onError,
}: {
  modeId: string
  hasQr: boolean
  onChanged: (message: string) => void
  onError: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [has, setHas] = useState(hasQr)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const endpoint = `/api/payment-modes/${modeId}/qr`

  async function send(init: RequestInit, done: string, after: () => void) {
    setBusy(true)

    const response = await fetch(endpoint, init)

    setBusy(false)

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      onError(payload?.error ?? 'Something went wrong')
      return
    }

    after()
    onChanged(done)
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex size-28 items-center justify-center rounded-lg bg-white p-2 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={version} src={`${endpoint}?v=${version}`} alt="QR code" className="size-full object-contain" />
        ) : (
          <Text className="text-center text-xs/5">No QR code</Text>
        )}
      </div>
      <div className="grid gap-2">
        <Text>An optional QR code to scan, such as a UPI QR. Shown beside the details.</Text>
        <div className="flex gap-2">
          <Button outline disabled={busy} onClick={() => input.current?.click()}>
            {has ? 'Replace QR code' : 'Upload QR code'}
          </Button>
          {has ? (
            <Button
              plain
              disabled={busy}
              onClick={() => void send({ method: 'DELETE' }, 'QR code removed', () => setHas(false))}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]

          if (file) {
            const body = new FormData()

            body.append('file', file)
            void send({ method: 'POST', body }, 'QR code updated', () => {
              setHas(true)
              setVersion((value) => value + 1)
            })
          }

          event.target.value = ''
        }}
      />
    </div>
  )
}
