'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardIcon, LinkIcon } from '@heroicons/react/16/solid'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Subheading } from '@/components/catalyst/heading'
import { Input } from '@/components/catalyst/input'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import {
  createShareLink,
  revokeShareLink,
  type SimpleResult,
} from '@/lib/actions/share'
import type { ShareDecision } from '@/generated/prisma/enums'

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function SharePanel({
  quotationId,
  share,
  canManage,
  baseUrl,
}: {
  quotationId: string
  baseUrl: string | null
  share: {
    token: string
    decision: ShareDecision
    viewCount: number
    lastViewedAt: Date | null
    respondedAt: Date | null
    respondedByName: string | null
    responseNote: string | null
    amendedAt: Date | null
    history: {
      id: string
      decision: ShareDecision
      respondedByName: string | null
      responseNote: string | null
      respondedAt: Date
      supersededAt: Date
      supersededReason: string | null
    }[]
  } | null
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [token, setToken] = useState(share?.token ?? null)

  const origin =
    baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const url = token ? `${origin}/q/${token}` : null

  function run(action: () => Promise<SimpleResult>, onToken?: (t: string) => void) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        if (outcome.id && onToken) {
          onToken(outcome.id)
        }

        router.refresh()
      }
    })
  }

  async function copy() {
    if (!url) return

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setResult({ ok: false, error: 'Could not copy. Select the link and copy it.' })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Subheading level={2}>Customer link</Subheading>
        {share?.decision === 'ACCEPTED' ? (
          <Badge color="lime">Approved by customer</Badge>
        ) : share?.decision === 'REJECTED' ? (
          <Badge color="red">Changes requested</Badge>
        ) : token ? (
          <Badge color="blue">Awaiting response</Badge>
        ) : null}
      </div>

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      {token ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={url ?? ''} className="sm:max-w-lg" />
            <Button outline onClick={copy}>
              <ClipboardIcon />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {canManage ? (
              <Button
                plain
                disabled={pending}
                onClick={() =>
                  run(() => revokeShareLink(quotationId), () => setToken(null))
                }
              >
                Revoke
              </Button>
            ) : null}
          </div>

          <Text>
            Anyone with this link can view the quotation and respond. It shows
            prices, images and terms, never your costs.
          </Text>

          {share ? (
            <Text>
              {share.viewCount === 0
                ? 'Not opened yet.'
                : `Opened ${share.viewCount} time${share.viewCount === 1 ? '' : 's'}${
                    share.lastViewedAt
                      ? `, last on ${timeFormat.format(share.lastViewedAt)}`
                      : ''
                  }.`}
            </Text>
          ) : null}

          {share?.amendedAt && share.decision === 'PENDING' ? (
            <FormBanner tone="error">
              Amended on {timeFormat.format(share.amendedAt)}. The customer is
              being asked to approve again.
            </FormBanner>
          ) : null}

          {share && share.history.length > 0 ? (
            <div className="rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
              <div className="text-sm/6 font-medium">Earlier responses</div>
              <ul className="mt-2 grid grid-cols-1 gap-2">
                {share.history.map((entry) => (
                  <li
                    key={entry.id}
                    className="text-sm/6 text-zinc-600 dark:text-zinc-400"
                  >
                    {entry.decision === 'ACCEPTED' ? 'Approved' : 'Changes requested'}{' '}
                    by {entry.respondedByName ?? 'customer'} on{' '}
                    {timeFormat.format(entry.respondedAt)} · superseded{' '}
                    {timeFormat.format(entry.supersededAt)}
                    {entry.supersededReason ? ` (${entry.supersededReason})` : ''}
                    {entry.responseNote ? ` — “${entry.responseNote}”` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {share?.respondedAt ? (
            <div className="rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
              <div className="text-sm/6 font-medium">
                {share.decision === 'ACCEPTED'
                  ? 'Approved'
                  : 'Changes requested'}{' '}
                by {share.respondedByName ?? 'customer'} on{' '}
                {timeFormat.format(share.respondedAt)}
              </div>
              {share.responseNote ? (
                <div className="mt-2 text-sm/6 text-zinc-600 dark:text-zinc-400">
                  {share.responseNote}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <Text>
            Create a link you can send over WhatsApp or email. The customer can
            view the quotation, comment on the designs and approve it without
            signing in.
          </Text>
          {canManage ? (
            <div>
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => createShareLink(quotationId), setToken)
                }
              >
                <LinkIcon />
                Create share link
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
