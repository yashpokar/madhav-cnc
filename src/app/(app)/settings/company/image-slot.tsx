'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'

/**
 * One uploadable picture (signature, stamp) with a preview. Uploads and
 * removals go straight to the endpoint; no form submit is involved.
 */
export function ImageSlot({
  title,
  help,
  endpoint,
  initiallyHasImage,
  emptyLabel,
}: {
  title: string
  help: string
  endpoint: string
  initiallyHasImage: boolean
  emptyLabel: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [has, setHas] = useState(initiallyHasImage)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function send(init: RequestInit, done: string, after: () => void) {
    setBusy(true)
    setMessage(null)

    const response = await fetch(endpoint, init)

    setBusy(false)

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      setMessage({ ok: false, text: payload?.error ?? 'Something went wrong' })
      return
    }

    after()
    setMessage({ ok: true, text: done })
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Subheading level={2}>{title}</Subheading>

      {message ? (
        <FormBanner tone={message.ok ? 'success' : 'error'}>{message.text}</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex h-28 w-56 items-center justify-center rounded-lg bg-white p-2 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10">
          {has ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image served by our API route; next/image cannot optimise it
            <img
              key={version}
              src={`${endpoint}?v=${version}`}
              alt={title}
              className="size-full object-contain"
            />
          ) : (
            <Text className="text-center text-xs/5">{emptyLabel}</Text>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Text>{help}</Text>
          <div className="flex gap-2">
            <Button outline disabled={busy} onClick={() => input.current?.click()}>
              {has ? 'Replace' : 'Upload'}
            </Button>
            {has ? (
              <Button
                plain
                disabled={busy}
                onClick={() =>
                  void send({ method: 'DELETE' }, `${title} removed`, () => setHas(false))
                }
              >
                Remove
              </Button>
            ) : null}
          </div>
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
            void send({ method: 'POST', body }, `${title} updated`, () => {
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
