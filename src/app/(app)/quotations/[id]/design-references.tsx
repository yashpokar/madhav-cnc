'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/16/solid'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Subheading } from '@/components/catalyst/heading'
import { Input } from '@/components/catalyst/input'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import {
  removeAttachment,
  restoreAttachment,
  setAttachmentComment,
} from '@/lib/actions/attachments'
import type { SimpleResult } from '@/lib/actions/attachments'
import type { AttachmentItem } from '@/lib/queries/quotations'

const MAX_BYTES = 50 * 1024 * 1024

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DesignReferences({
  quotationId,
  attachments,
  canEdit,
  locked,
}: {
  quotationId: string
  attachments: AttachmentItem[]
  canEdit: boolean
  locked: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [comments, setComments] = useState<Record<string, string>>({})

  const current = attachments.filter((item) => item.removedAt === null)
  const removed = attachments.filter((item) => item.removedAt !== null)

  const editable = canEdit && !locked

  async function upload(files: File[]) {
    if (files.length === 0) return

    setUploading(true)
    setResult(null)

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setResult({
          ok: false,
          error: `${file.name || 'Image'} is ${formatSize(file.size)} — over the 50 MB limit`,
        })
        continue
      }

      const body = new FormData()
      body.append('file', file)

      try {
        const response = await fetch(
          `/api/quotations/${quotationId}/attachments`,
          { method: 'POST', body },
        )

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
          setResult({ ok: false, error: payload?.error ?? 'Upload failed' })
          continue
        }

        setResult({ ok: true, message: `${file.name || 'Image'} added` })
      } catch {
        setResult({ ok: false, error: 'Upload failed' })
      }
    }

    setUploading(false)
    router.refresh()
  }

  function run(action: () => Promise<SimpleResult>) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div
      className="grid grid-cols-1 gap-4"
      onPaste={(event) => {
        if (!editable) return

        const files = Array.from(event.clipboardData?.files ?? [])

        if (files.length > 0) {
          event.preventDefault()
          void upload(files)
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Subheading level={2}>Design references</Subheading>
        <div className="flex items-center gap-3">
          {removed.length > 0 ? (
            <Button plain onClick={() => setShowHistory((value) => !value)}>
              {showHistory
                ? 'Hide history'
                : `History (${removed.length})`}
            </Button>
          ) : null}
          {editable ? (
            <Button
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <ArrowUpTrayIcon />
              {uploading ? 'Uploading…' : 'Add images'}
            </Button>
          ) : null}
        </div>
      </div>

      {locked ? (
        <Text>
          This quotation is confirmed as an order, so its design references are
          locked. Raise a new order from it, or work on a revision, to change
          them.
        </Text>
      ) : null}

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf"
        multiple
        hidden
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />

      {editable ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void upload(Array.from(event.dataTransfer.files))
          }}
          className={
            dragging
              ? 'rounded-lg border-2 border-dashed border-blue-500 bg-blue-50 px-6 py-8 text-center text-sm/6 dark:bg-blue-500/10'
              : 'rounded-lg border-2 border-dashed border-zinc-950/15 px-6 py-8 text-center text-sm/6 text-zinc-500 dark:border-white/15 dark:text-zinc-400'
          }
        >
          Drop images here, or paste from the clipboard with ⌘V. Up to 50 MB
          each.
        </div>
      ) : null}

      {current.length === 0 ? (
        <Text>No design references yet.</Text>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((item) => (
            <figure
              key={item.id}
              className="grid grid-cols-1 gap-2 rounded-lg p-3 ring-1 ring-zinc-950/10 dark:ring-white/10"
            >
              <a
                href={`/api/attachments/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md bg-zinc-100 dark:bg-white/5"
              >
                {item.mimeType === 'application/pdf' ? (
                  <div className="flex h-40 items-center justify-center text-sm/6 text-zinc-500 dark:text-zinc-400">
                    PDF · {item.fileName}
                  </div>
                ) : (
                  <img
                    src={`/api/attachments/${item.id}`}
                    alt={item.comment ?? item.fileName}
                    className="h-40 w-full object-cover"
                  />
                )}
              </a>

              <figcaption className="grid grid-cols-1 gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                <span className="truncate font-medium text-zinc-950 dark:text-white">
                  {item.fileName}
                </span>
                <span>
                  {formatSize(item.sizeBytes)} ·{' '}
                  {timeFormat.format(item.createdAt)}
                  {item.uploadedBy ? ` · ${item.uploadedBy.name}` : ''}
                </span>
              </figcaption>

              {editable ? (
                <div className="grid grid-cols-1 gap-2">
                  <Input
                    aria-label={`Comment for ${item.fileName}`}
                    placeholder="Add a comment"
                    defaultValue={item.comment ?? ''}
                    onChange={(event) =>
                      setComments((state) => ({
                        ...state,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      outline
                      disabled={pending || comments[item.id] === undefined}
                      onClick={() =>
                        run(() =>
                          setAttachmentComment(
                            item.id,
                            comments[item.id] ?? '',
                          ),
                        )
                      }
                    >
                      Save comment
                    </Button>
                    <Button
                      plain
                      disabled={pending}
                      onClick={() => run(() => removeAttachment(item.id))}
                    >
                      <TrashIcon />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : item.comment ? (
                <Text className="text-sm/6">{item.comment}</Text>
              ) : null}
            </figure>
          ))}
        </div>
      )}

      {showHistory && removed.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-zinc-950/[0.03] p-4 dark:bg-white/5">
          <Subheading level={3}>Removed earlier</Subheading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {removed.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10"
              >
                <a
                  href={`/api/attachments/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.mimeType === 'application/pdf' ? (
                    <div className="flex h-24 items-center justify-center rounded-md bg-zinc-100 text-xs/5 text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                      PDF
                    </div>
                  ) : (
                    <img
                      src={`/api/attachments/${item.id}`}
                      alt={item.fileName}
                      className="h-24 w-full rounded-md object-cover opacity-70"
                    />
                  )}
                </a>
                <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                  <div className="truncate">{item.fileName}</div>
                  <Badge color="zinc">
                    Removed {item.removedAt ? timeFormat.format(item.removedAt) : ''}
                  </Badge>
                </div>
                {editable ? (
                  <Button
                    plain
                    disabled={pending}
                    onClick={() => run(() => restoreAttachment(item.id))}
                  >
                    Restore
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
