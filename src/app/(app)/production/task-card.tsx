'use client'

import { dateShort as dateFormat } from '@/lib/format'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Link } from '@/components/catalyst/link'
import {
  completeTask,
  holdTask,
  reopenTask,
  skipTask,
  startTask,
} from '@/lib/actions/production'
import type { SimpleResult } from '@/lib/actions/production'
import { blockingTask, holdReason, reopenCheck } from '@/lib/production-rules'
import type { BoardTask } from '@/lib/queries/production'
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

export function TaskCard({
  task,
  canUpdate,
  onResult,
}: {
  task: BoardTask
  canUpdate: boolean
  onResult: (result: SimpleResult) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const siblings = task.order.productionTasks
  const blocker =
    task.status === 'PENDING' ? blockingTask(siblings, task.id) : null
  const reopenable = reopenCheck(siblings, task.id, task.order.status).ok

  function move(action: () => Promise<SimpleResult>) {
    startTransition(async () => {
      const outcome = await action()
      onResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  const overdue =
    task.order.dueDate !== null &&
    task.status !== 'DONE' &&
    task.status !== 'SKIPPED' &&
    task.order.dueDate < new Date()

  return (
    <div className="surface-card p-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/orders/${task.order.id}`}
          className="font-mono text-xs font-medium text-zinc-950 hover:underline dark:text-white"
        >
          {task.order.number}
        </Link>
        <Badge color={STATUS_COLORS[task.status]}>
          {STATUS_LABELS[task.status]}
        </Badge>
      </div>

      <div className="mt-1 text-sm/5 font-medium">{task.order.customer.name}</div>
      {task.order.subject ? (
        <div className="truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
          {task.order.subject}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs/5 text-zinc-500 dark:text-zinc-400">
        {task.order.dueDate ? (
          <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>
            Due {dateFormat.format(task.order.dueDate)}
          </span>
        ) : (
          <span>No due date</span>
        )}
        {task.order.lines.some(
          (line) => line.materialSupply === 'WITHOUT_MATERIAL',
        ) ? (
          <Badge color="orange">Customer material</Badge>
        ) : null}
      </div>

      {task.assignedTo ? (
        <div className="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          {task.assignedTo.name}
        </div>
      ) : null}

      {blocker ? (
        <div className="mt-2 text-xs/5 text-zinc-500 dark:text-zinc-400">
          Waiting for {blocker.stage.name}
        </div>
      ) : null}

      {task.status === 'ON_HOLD' && holdReason(task.notes) ? (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs/5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          On hold: {holdReason(task.notes)}
        </div>
      ) : null}

      {canUpdate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(task.status === 'PENDING' && !blocker) ||
          (task.status === 'ON_HOLD' &&
            !blockingTask(siblings, task.id)) ? (
            <Button disabled={pending} onClick={() => move(() => startTask(task.id))}>
              {task.status === 'ON_HOLD' ? 'Resume' : 'Start'}
            </Button>
          ) : null}
          {task.status === 'IN_PROGRESS' ? (
            <>
              <Button disabled={pending} onClick={() => move(() => completeTask(task.id))}>
                Done
              </Button>
              <Button outline disabled={pending} onClick={() => move(() => holdTask(task.id))}>
                Hold
              </Button>
            </>
          ) : null}
          {task.status === 'DONE' && reopenable ? (
            <Button outline disabled={pending} onClick={() => move(() => reopenTask(task.id))}>
              Reopen
            </Button>
          ) : null}
          {task.status === 'PENDING' ? (
            <Button plain disabled={pending} onClick={() => move(() => skipTask(task.id))}>
              Skip
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
