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
  createMaterial,
  moveMaterial,
  renameMaterial,
  setMaterialActive,
} from '@/lib/actions/materials'
import type { SimpleResult } from '@/lib/actions/materials'
import type { MaterialRow } from '@/lib/queries/materials'

export function MaterialManager({ materials }: { materials: MaterialRow[] }) {
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
          <Label>New material</Label>
          <Input
            value={newName}
            placeholder="Material name"
            onChange={(event) => setNewName(event.target.value)}
          />
        </Field>
        <Button
          disabled={pending || newName.trim() === ''}
          onClick={() => run(() => createMaterial(newName), () => setNewName(''))}
        >
          Add material
        </Button>
      </div>

      <Table dense grid striped>
        <TableHead>
          <TableRow>
            <TableHeader className="w-8">#</TableHeader>
            <TableHeader>Material</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader className="text-right">Items</TableHeader>
            <TableHeader className="text-right">Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {materials.map((material, index) => (
            <TableRow key={material.id}>
              <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                {index + 1}
              </TableCell>
              <TableCell>
                {editing === material.id ? (
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
                          () => renameMaterial(material.id, editName),
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
                  <span className="font-medium">{material.name}</span>
                )}
              </TableCell>
              <TableCell>
                {material.isActive ? (
                  <Badge color="lime">Active</Badge>
                ) : (
                  <Badge color="zinc">Retired</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                {material._count.items}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    plain
                    aria-label="Move up"
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveMaterial(material.id, 'up'))}
                  >
                    <ChevronUpIcon />
                  </Button>
                  <Button
                    plain
                    aria-label="Move down"
                    disabled={pending || index === materials.length - 1}
                    onClick={() => run(() => moveMaterial(material.id, 'down'))}
                  >
                    <ChevronDownIcon />
                  </Button>
                  <Button
                    plain
                    disabled={pending}
                    onClick={() => {
                      setEditing(material.id)
                      setEditName(material.name)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    plain
                    disabled={pending}
                    onClick={() =>
                      run(() => setMaterialActive(material.id, !material.isActive))
                    }
                  >
                    {material.isActive ? 'Retire' : 'Enable'}
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
