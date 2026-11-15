'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardIcon, LinkIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import {
  createTrackingLink,
  replaceTrackingLink,
  revokeTrackingLink,
} from '@/lib/actions/tracking'
import { whatsappLink } from '@/lib/whatsapp'
import { isWhatsAppSafeToken } from '@/lib/share-token'

export function TrackingPanel({
  orderId,
  orderNumber,
  token: initialToken,
  customerName,
  customerPhone,
  baseUrl,
}: {
  orderId: string
  orderNumber: string
  token: string | null
  customerName: string
  customerPhone: string | null
  baseUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [token, setToken] = useState(initialToken)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const origin =
    baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const url = token ? `${origin}/t/${token}` : null

  function create() {
    startTransition(async () => {
      const outcome = await createTrackingLink(orderId)

      if (outcome.ok && outcome.id) {
        setToken(outcome.id)
        setError(null)
        router.refresh()
      } else if (!outcome.ok) {
        setError(outcome.error)
      }
    })
  }

  function replace() {
    startTransition(async () => {
      const outcome = await replaceTrackingLink(orderId)

      if (outcome.ok && outcome.id) {
        setToken(outcome.id)
        setError(null)
        router.refresh()
      } else if (!outcome.ok) {
        setError(outcome.error)
      }
    })
  }

  async function copy() {
    if (!url) {
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy. Select the link and copy it manually.')
    }
  }

  return (
    <section aria-labelledby="tracking-heading" className="grid gap-3">
      <div className="grid gap-1">
        <Subheading id="tracking-heading" level={2}>
          Customer tracking link
        </Subheading>
        <Text>
          Lets the customer follow progress and delivery. Prices are never shown.
        </Text>
      </div>

      {error ? (
        <div role="alert">
          <FormBanner tone="error">{error}</FormBanner>
        </div>
      ) : null}

      {url && token && !isWhatsAppSafeToken(token) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm/6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <span>This older link can break when sent on WhatsApp. Create a new link.</span>
          <Button outline disabled={pending} onClick={replace}>
            Replace link
          </Button>
        </div>
      ) : null}

      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            readOnly
            aria-label="Tracking link"
            value={url}
            className="sm:max-w-md"
          />
          <Button outline onClick={copy}>
            <ClipboardIcon />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            outline
            target="_blank"
            rel="noopener noreferrer"
            href={whatsappLink(
              customerPhone,
              `Hello ${customerName}, you can follow the progress of your order ${orderNumber} here:\n\n${url}`,
            )}
          >
            WhatsApp
          </Button>
          <ConfirmButton
            outline={false}
            label="Revoke"
            title="Revoke the tracking link?"
            description="The current link stops working straight away. Create a new link to share again."
            confirmLabel="Revoke link"
            action={async () => {
              const outcome = await revokeTrackingLink(orderId)

              if (outcome.ok) {
                setToken(null)
              }

              return outcome
            }}
          />
        </div>
      ) : (
        <div>
          <Button outline disabled={pending} onClick={create}>
            <LinkIcon />
            Create tracking link
          </Button>
        </div>
      )}
    </section>
  )
}
