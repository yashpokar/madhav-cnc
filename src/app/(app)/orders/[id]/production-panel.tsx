'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Subheading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { setTaskStatus, startProduction } from '@/lib/actions/production'
import type { SimpleResult } from '@/lib/actions/production'
import type { OrderTask } from '@/lib/queries/production'
import { ProductionTaskStatus } from '@/generated/prisma/enums'

const STATUS_LABELS: Record<ProductionTaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  DONE: 'Done',
  SKIPPED: 'Skipped',
}

const STATUS_COLORS: Record<
  ProductionTaskStatus,
  'zinc' | 'blue' | 'amber' | 'lime'
> = {
  PENDING: 'zinc',
  IN_PROGRESS: 'blue',
  ON_HOLD: 'amber',
  DONE: 'lime',
  SKIPPED: 'zinc',
}

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function ProductionPanel({
  orderId,
  orderStatus,
  tasks,
  canUpdate,
}: {
  orderId: string
  orderStatus: string
  tasks: OrderTask[]
  canUpdate: boolean
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

  const finished = tasks.filter(
    (task) => task.status === 'DONE' || task.status === 'SKIPPED',
  ).length

  if (tasks.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <Subheading level={2}>Production</Subheading>
        {result ? (
          <FormBanner tone={result.ok ? 'success' : 'error'}>
            {result.ok ? result.message : result.error}
          </FormBanner>
        ) : null}
        <Text>
          {orderStatus === 'CONFIRMED'
            ? 'Not started. Putting this order into production creates a task for each stage.'
            : 'No production stages recorded for this order.'}
        </Text>
        {canUpdate && orderStatus === 'CONFIRMED' ? (
          <div>
            <Button
              disabled={pending}
              onClick={() => run(() => startProduction(orderId))}
            >
              Start production
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Subheading level={2}>Production</Subheading>
        <Text>
          {finished} of {tasks.length} stages complete
        </Text>
      </div>

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <Table dense grid>
        <TableHead>
          <TableRow>
            <TableHeader className="w-8">#</TableHeader>
            <TableHeader>Stage</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Who</TableHeader>
            <TableHeader>Completed</TableHeader>
            {canUpdate ? <TableHeader className="text-right">Action</TableHeader> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                {task.position}
              </TableCell>
              <TableCell className="font-medium">{task.stage.name}</TableCell>
              <TableCell>
                <Badge color={STATUS_COLORS[task.status]}>
                  {STATUS_LABELS[task.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                {task.assignedTo?.name ?? '—'}
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                {task.completedAt ? timeFormat.format(task.completedAt) : '—'}
              </TableCell>
              {canUpdate ? (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {task.status === 'PENDING' || task.status === 'ON_HOLD' ? (
                      <Button
                        disabled={pending}
                        onClick={() => run(() => setTaskStatus(task.id, 'IN_PROGRESS'))}
                      >
                        Start
                      </Button>
                    ) : null}
                    {task.status === 'IN_PROGRESS' ? (
                      <Button
                        disabled={pending}
                        onClick={() => run(() => setTaskStatus(task.id, 'DONE'))}
                      >
                        Done
                      </Button>
                    ) : null}
                    {task.status === 'DONE' ? (
                      <Button
                        outline
                        disabled={pending}
                        onClick={() => run(() => setTaskStatus(task.id, 'IN_PROGRESS'))}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
