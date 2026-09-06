'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/16/solid'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { FormBanner } from '@/components/form-banner'
import {
  createStage,
  moveStage,
  renameStage,
  setStageActive,
} from '@/lib/actions/stages'
import type { SimpleResult } from '@/lib/actions/stages'
import type { StageRow } from '@/lib/queries/stages'

export function StageManager({ stages }: { stages: StageRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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
    <div className="grid grid-cols-1 gap-6">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-64">
          <Label>New stage</Label>
          <Input
            value={newName}
            placeholder="Stage name"
            onChange={(event) => setNewName(event.target.value)}
          />
        </Field>
        <Button
          disabled={pending || newName.trim() === ''}
          onClick={() => run(() => createStage(newName), () => setNewName(''))}
        >
          Add stage
        </Button>
      </div>

      <Table dense grid striped>
        <TableHead>
          <TableRow>
            <TableHeader className="w-8">#</TableHeader>
            <TableHeader>Stage</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader className="text-right">Tasks</TableHeader>
            <TableHeader className="text-right">Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {stages.map((stage, index) => (
            <TableRow key={stage.id}>
              <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                {index + 1}
              </TableCell>
              <TableCell>
                {editing === stage.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      autoFocus
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => renameStage(stage.id, editName),
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button plain onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <span className="font-medium">{stage.name}</span>
                )}
              </TableCell>
              <TableCell>
                {stage.isActive ? (
                  <Badge color="lime">Active</Badge>
                ) : (
                  <Badge color="zinc">Retired</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                {stage._count.tasks}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    plain
                    aria-label="Move up"
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveStage(stage.id, 'up'))}
                  >
                    <ChevronUpIcon />
                  </Button>
                  <Button
                    plain
                    aria-label="Move down"
                    disabled={pending || index === stages.length - 1}
                    onClick={() => run(() => moveStage(stage.id, 'down'))}
                  >
                    <ChevronDownIcon />
                  </Button>
                  <Button
                    plain
                    disabled={pending}
                    onClick={() => {
                      setEditing(stage.id)
                      setEditName(stage.name)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    plain
                    disabled={pending}
                    onClick={() =>
                      run(() => setStageActive(stage.id, !stage.isActive))
                    }
                  >
                    {stage.isActive ? 'Retire' : 'Enable'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
