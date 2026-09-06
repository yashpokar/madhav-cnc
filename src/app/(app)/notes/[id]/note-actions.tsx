'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { FormBanner } from '@/components/form-banner'
import { deleteNote, setNoteStatus, type SimpleResult } from '@/lib/actions/notes'
import type { NoteStatus } from '@/generated/prisma/enums'

export function NoteActions({
  id,
  status,
  canUpdate,
  canDelete,
}: {
  id: string
  status: NoteStatus
  canUpdate: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)

  function run(action: () => Promise<SimpleResult>) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  function move(next: NoteStatus) {
    run(() => setNoteStatus(id, next))
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {canUpdate && status === 'DRAFT' ? (
          <>
            <Button disabled={pending} onClick={() => move('ISSUED')}>
              Issue note
            </Button>
            <Button outline disabled={pending} onClick={() => move('CANCELLED')}>
              Cancel note
            </Button>
          </>
        ) : null}

        {canUpdate && status === 'ISSUED' ? (
          <Button outline disabled={pending} onClick={() => move('CANCELLED')}>
            Cancel note
          </Button>
        ) : null}

        {canUpdate && status === 'CANCELLED' ? (
          <Button outline disabled={pending} onClick={() => move('DRAFT')}>
            Back to draft
          </Button>
        ) : null}

        {canDelete && status !== 'ISSUED' ? (
          <Button
            plain
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await deleteNote(id)

                if (outcome.ok) {
                  router.push('/notes')
                } else {
                  setResult(outcome)
                }
              })
            }
          >
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  )
}
