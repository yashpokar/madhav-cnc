'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import {
  Description,
  Field,
  Label,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import {
  addCustomerComment,
  respondToShare,
  type SimpleResult,
} from '@/lib/actions/share'

export function RespondPanel({
  token,
  decision,
  respondedByName,
  respondedAt,
  responseNote,
}: {
  token: string
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  respondedByName: string | null
  respondedAt: Date | null
  responseNote: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'none' | 'accept' | 'reject'>('none')

  if (decision !== 'PENDING') {
    return (
      <div
        className={
          decision === 'ACCEPTED'
            ? 'rounded-lg bg-lime-50 p-5 ring-1 ring-lime-950/10'
            : 'rounded-lg bg-red-50 p-5 ring-1 ring-red-950/10'
        }
      >
        <div className="text-base/6 font-semibold text-zinc-950">
          {decision === 'ACCEPTED'
            ? 'Approved — thank you'
            : 'Marked as not approved'}
        </div>
        <div className="mt-1 text-sm/6 text-zinc-600">
          Recorded{respondedByName ? ` by ${respondedByName}` : ''}
          {respondedAt
            ? ` on ${new Intl.DateTimeFormat('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(respondedAt)}`
            : ''}
        </div>
        {responseNote ? (
          <div className="mt-3 rounded-md bg-white/70 p-3 text-sm/6 text-zinc-700">
            {responseNote}
          </div>
        ) : null}
      </div>
    )
  }

  function submit(target: 'ACCEPTED' | 'REJECTED') {
    startTransition(async () => {
      const outcome = await respondToShare({
        token,
        decision: target,
        name,
        note: note.trim() || undefined,
      })

      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg bg-zinc-50 p-5 ring-1 ring-zinc-950/10">
      <div>
        <div className="text-base/6 font-semibold text-zinc-950">
          Your acknowledgement
        </div>
        <div className="mt-1 text-sm/6 text-zinc-600">
          Let us know whether this quotation is approved. We start work once you
          confirm.
        </div>
      </div>

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      {mode === 'none' ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setMode('accept')}>Approve quotation</Button>
          <Button outline onClick={() => setMode('reject')}>
            Request changes
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <Field>
            <Label>Your name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <Label>
              {mode === 'accept' ? 'Anything to add?' : 'What needs changing?'}
            </Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {mode === 'reject' ? (
              <Description>
                A short reason helps us send a corrected quotation quickly.
              </Description>
            ) : null}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={pending || name.trim() === ''}
              onClick={() => submit(mode === 'accept' ? 'ACCEPTED' : 'REJECTED')}
            >
              {pending
                ? 'Sending…'
                : mode === 'accept'
                  ? 'Confirm approval'
                  : 'Send feedback'}
            </Button>
            <Button plain onClick={() => setMode('none')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CommentBox({
  token,
  attachmentId,
  label,
}: {
  token: string
  attachmentId?: string | null
  label: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<SimpleResult | null>(null)

  if (!open) {
    return (
      <Button plain onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}
      <Input
        placeholder="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        rows={2}
        placeholder="Your comment"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          disabled={pending || name.trim() === '' || body.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              const outcome = await addCustomerComment({
                token,
                attachmentId,
                body,
                name,
              })
              setResult(outcome)

              if (outcome.ok) {
                setBody('')
                setOpen(false)
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Sending…' : 'Post comment'}
        </Button>
        <Button plain onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
