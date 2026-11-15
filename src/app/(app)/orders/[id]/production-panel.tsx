'use client'

import { useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircleIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  ForwardIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from '@heroicons/react/20/solid'
import { Avatar } from '@/components/catalyst/avatar'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { LocalTime } from '@/components/local-time'
import {
  assignTask,
  completeTask,
  holdTask,
  reopenTask,
  saveTaskNotes,
  skipTask,
  startProduction,
  startTask,
} from '@/lib/actions/production'
import type { SimpleResult } from '@/lib/actions/production'
import {
  blockingTask,
  dueLabel,
  formatDuration,
  holdReason,
  initials,
  progressCounts,
  reopenCheck,
  stageState,
  startNeedsForce,
  taskDurationLabel,
  totalElapsedMs,
  type StageState,
} from '@/lib/production-rules'
import type { OperatorOption, OrderTask } from '@/lib/queries/production'
import type { ProductionTaskStatus } from '@/generated/prisma/enums'

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

const STATUS_ICONS: Record<
  ProductionTaskStatus,
  React.ComponentType<React.ComponentPropsWithoutRef<'svg'>>
> = {
  PENDING: ClockIcon,
  IN_PROGRESS: PlayCircleIcon,
  ON_HOLD: PauseCircleIcon,
  DONE: CheckCircleIcon,
  SKIPPED: ForwardIcon,
}

const NODE_STYLES: Record<ProductionTaskStatus, string> = {
  PENDING: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
  IN_PROGRESS: 'bg-blue-500 text-white',
  ON_HOLD: 'bg-amber-400 text-amber-950',
  DONE: 'bg-lime-500 text-white',
  SKIPPED: 'bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200',
}

const SEGMENT_STYLES: Record<ProductionTaskStatus, string> = {
  PENDING: 'bg-zinc-200 dark:bg-zinc-700',
  IN_PROGRESS: 'bg-blue-500',
  ON_HOLD: 'bg-amber-400',
  DONE: 'bg-lime-500',
  SKIPPED: 'bg-zinc-400 dark:bg-zinc-500',
}

const MINUTE = 60_000

/** The current time, ticking each minute. 0 on the server so hydration matches. */
function useNow(): Date | null {
  const value = useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, MINUTE)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => 0,
  )

  return value === 0 ? null : new Date(value)
}

type Dialogue =
  | { kind: 'hold' | 'skip' | 'anyway' | 'reopen'; task: OrderTask }
  | null

export function ProductionPanel({
  orderId,
  orderStatus,
  tasks,
  canUpdate,
  isAdmin = false,
  dueDate = null,
  operators = [],
  plannedStages = [],
}: {
  orderId: string
  orderStatus: string
  tasks: OrderTask[]
  canUpdate: boolean
  isAdmin?: boolean
  dueDate?: Date | null
  operators?: OperatorOption[]
  /** Names of the stages starting production will create, for the empty state. */
  plannedStages?: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [reason, setReason] = useState('')
  const now = useNow()

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

  function openDialogue(next: Dialogue) {
    setReason('')
    setDialogue(next)
  }

  function confirmDialogue() {
    if (!dialogue) return

    const { kind, task } = dialogue
    const text = reason

    const action = {
      hold: () => holdTask(task.id, text),
      skip: () => skipTask(task.id, text),
      anyway: () => startTask(task.id, { force: true }),
      reopen: () => reopenTask(task.id),
    }[kind]

    run(action, () => setDialogue(null))
  }

  const active = canUpdate && orderStatus !== 'CANCELLED'
  const counts = progressCounts(tasks)

  if (tasks.length === 0) {
    const canStart = active && orderStatus === 'CONFIRMED'

    return (
      <div className="grid grid-cols-1 gap-4">
        <Subheading level={2}>Production</Subheading>
        {result ? (
          <FormBanner tone={result.ok ? 'success' : 'error'}>
            {result.ok ? result.message : result.error}
          </FormBanner>
        ) : null}
        <div className="rounded-xl border border-dashed border-zinc-950/15 p-6 dark:border-white/15">
          <div className="text-sm/6 font-medium">Not started yet</div>
          <Text className="mt-1">
            {orderStatus === 'CONFIRMED'
              ? plannedStages.length > 0
                ? `Starting production creates ${plannedStages.length} stage${plannedStages.length === 1 ? '' : 's'} (${plannedStages.join(', ')}), moves this order to In production and lets your team work through them one after another, with who is doing what and how long each took.`
                : 'Starting production creates a task for each stage of your workflow and moves this order to In production.'
              : 'No production stages recorded for this order.'}
          </Text>
          {canStart ? (
            <div className="mt-4">
              <Button
                disabled={pending}
                onClick={() => run(() => startProduction(orderId))}
              >
                {pending ? 'Starting…' : 'Start production'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const current =
    tasks.find((task) => task.status === 'IN_PROGRESS') ??
    tasks.find((task) => task.status === 'ON_HOLD') ??
    tasks.find((task) => task.status === 'PENDING') ??
    null
  const currentLabel =
    now && current ? taskDurationLabel(current, now) : null
  const total = now ? totalElapsedMs(tasks, now) : null
  const due = dueDate && now ? dueLabel(dueDate, now) : null

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Subheading level={2}>Production</Subheading>
          <div className="flex flex-wrap items-center gap-2">
            {counts.complete ? (
              <Badge color="lime">All stages complete</Badge>
            ) : due ? (
              <Badge
                color={
                  due.tone === 'overdue'
                    ? 'red'
                    : due.tone === 'soon'
                      ? 'amber'
                      : 'zinc'
                }
              >
                {due.text}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Text>
            <span className="font-medium text-zinc-950 dark:text-white">
              {counts.finished} of {counts.total}
            </span>{' '}
            stages complete
            {counts.skipped > 0 ? ` (${counts.skipped} skipped)` : ''}
          </Text>
          <Text>
            {[
              current && currentLabel && current.status === 'IN_PROGRESS'
                ? `${current.stage.name}: ${currentLabel}`
                : null,
              total !== null
                ? `${formatDuration(total)} ${counts.complete ? 'in total' : 'since production started'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </div>

        <ol
          className="flex gap-1"
          aria-label={`${counts.finished} of ${counts.total} stages complete`}
        >
          {tasks.map((task) => (
            <li
              key={task.id}
              title={`${task.stage.name}: ${STATUS_LABELS[task.status]}`}
              className={`h-2 flex-1 rounded-full ${SEGMENT_STYLES[task.status]} ${
                task.id === current?.id
                  ? 'ring-2 ring-blue-500/40 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
                  : ''
              }`}
            />
          ))}
        </ol>
      </div>

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <ol className="grid grid-cols-1">
        {tasks.map((task, index) => (
          <StageRow
            key={task.id}
            task={task}
            tasks={tasks}
            last={index === tasks.length - 1}
            state={stageState(tasks, task.id)}
            current={task.id === current?.id}
            now={now}
            active={active}
            canUpdate={canUpdate}
            isAdmin={isAdmin}
            orderStatus={orderStatus}
            operators={operators}
            pending={pending}
            run={run}
            openDialogue={openDialogue}
          />
        ))}
      </ol>

      <Dialog
        open={dialogue !== null}
        onClose={() => (pending ? undefined : setDialogue(null))}
        size="md"
      >
        {dialogue ? (
          <>
            <DialogTitle>
              {dialogue.kind === 'hold'
                ? `Put ${dialogue.task.stage.name} on hold`
                : dialogue.kind === 'skip'
                  ? `Skip ${dialogue.task.stage.name}`
                  : dialogue.kind === 'reopen'
                    ? `Reopen ${dialogue.task.stage.name}`
                    : `Start ${dialogue.task.stage.name} anyway`}
            </DialogTitle>
            <DialogDescription>
              {dialogue.kind === 'hold'
                ? 'The stage is paused and shown as on hold until someone resumes it.'
                : dialogue.kind === 'skip'
                  ? 'The stage counts as finished without being done, and the next stage becomes available.'
                  : dialogue.kind === 'reopen'
                    ? 'The stage goes back to in progress and its finish time is cleared. The order status is adjusted to match the stages that are still finished.'
                    : `${blockingTask(tasks, dialogue.task.id)?.stage.name ?? 'An earlier stage'} is not finished yet. Starting this stage now skips the usual order.`}
            </DialogDescription>
            {dialogue.kind === 'hold' || dialogue.kind === 'skip' ? (
              <DialogBody>
                <Textarea
                  aria-label="Reason"
                  rows={3}
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </DialogBody>
            ) : null}
            <DialogActions>
              <Button
                plain
                disabled={pending}
                onClick={() => setDialogue(null)}
              >
                Cancel
              </Button>
              <Button
                color="dark/zinc"
                disabled={pending}
                onClick={confirmDialogue}
                autoFocus
              >
                {pending
                  ? 'Working…'
                  : dialogue.kind === 'hold'
                    ? 'Put on hold'
                    : dialogue.kind === 'skip'
                      ? 'Skip stage'
                      : dialogue.kind === 'reopen'
                        ? 'Reopen stage'
                        : 'Start anyway'}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </div>
  )
}

function StageRow({
  task,
  tasks,
  last,
  state,
  current,
  now,
  active,
  canUpdate,
  isAdmin,
  orderStatus,
  operators,
  pending,
  run,
  openDialogue,
}: {
  task: OrderTask
  tasks: OrderTask[]
  last: boolean
  state: StageState
  current: boolean
  now: Date | null
  active: boolean
  canUpdate: boolean
  isAdmin: boolean
  orderStatus: string
  operators: OperatorOption[]
  pending: boolean
  run: (action: () => Promise<SimpleResult>, after?: () => void) => void
  openDialogue: (next: Dialogue) => void
}) {
  const Icon = STATUS_ICONS[task.status]
  const blocker = blockingTask(tasks, task.id)
  const duration = now ? taskDurationLabel(task, now) : null
  const reopen = reopenCheck(tasks, task.id, orderStatus)
  const outOfOrder = startNeedsForce(tasks, task.id)
  const queued = state === 'queued'
  const reason = task.status === 'ON_HOLD' ? holdReason(task.notes) : null

  const hasMenu =
    active &&
    (state === 'active' ||
      state === 'held' ||
      state === 'next' ||
      state === 'queued' ||
      (state === 'finished' && reopen.ok))

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4">
      {last ? null : (
        <span
          aria-hidden
          className={`absolute top-8 bottom-0 left-3.5 w-px -translate-x-1/2 ${
            task.status === 'DONE' || task.status === 'SKIPPED'
              ? 'bg-lime-500/60'
              : 'bg-zinc-950/10 dark:bg-white/10'
          }`}
        />
      )}
      <span
        className={`relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${NODE_STYLES[task.status]} ${
          current ? 'ring-4 ring-blue-500/20' : ''
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>

      <div
        className={`min-w-0 flex-1 rounded-lg ${
          current
            ? 'bg-blue-50/60 p-3 -m-3 ring-1 ring-blue-500/20 dark:bg-blue-400/5'
            : ''
        } ${queued ? 'opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm/6 font-medium">
              <span className="mr-1.5 tabular-nums text-zinc-400 dark:text-zinc-500">
                {task.position}.
              </span>
              {task.stage.name}
            </span>
            <Badge color={STATUS_COLORS[task.status]}>
              <Icon className="size-3.5" aria-hidden />
              {STATUS_LABELS[task.status]}
            </Badge>
          </div>

          {active ? (
            <div className="flex items-center gap-1">
              {state === 'next' ? (
                <Button
                  disabled={pending}
                  onClick={() => run(() => startTask(task.id))}
                >
                  Start {task.stage.name}
                </Button>
              ) : null}
              {state === 'active' ? (
                <Button
                  disabled={pending}
                  onClick={() => run(() => completeTask(task.id))}
                >
                  Mark done
                </Button>
              ) : null}
              {state === 'held' && !outOfOrder ? (
                <Button
                  disabled={pending}
                  onClick={() => run(() => startTask(task.id))}
                >
                  Resume
                </Button>
              ) : null}

              {hasMenu ? (
                <Dropdown>
                  <DropdownButton plain aria-label={`More actions for ${task.stage.name}`}>
                    <EllipsisVerticalIcon />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    {state === 'active' ? (
                      <DropdownItem onClick={() => openDialogue({ kind: 'hold', task })}>
                        <DropdownLabel>Put on hold</DropdownLabel>
                      </DropdownItem>
                    ) : null}
                    {state === 'held' && outOfOrder && isAdmin ? (
                      <DropdownItem onClick={() => openDialogue({ kind: 'anyway', task })}>
                        <DropdownLabel>Resume anyway</DropdownLabel>
                      </DropdownItem>
                    ) : null}
                    {state === 'queued' && isAdmin ? (
                      <DropdownItem onClick={() => openDialogue({ kind: 'anyway', task })}>
                        <DropdownLabel>Start anyway</DropdownLabel>
                      </DropdownItem>
                    ) : null}
                    {state === 'finished' && reopen.ok ? (
                      <DropdownItem onClick={() => openDialogue({ kind: 'reopen', task })}>
                        <DropdownLabel>Reopen</DropdownLabel>
                      </DropdownItem>
                    ) : null}
                    {state !== 'finished' ? (
                      <>
                        <DropdownDivider />
                        <DropdownItem onClick={() => openDialogue({ kind: 'skip', task })}>
                          <DropdownLabel>Skip stage</DropdownLabel>
                        </DropdownItem>
                      </>
                    ) : null}
                  </DropdownMenu>
                </Dropdown>
              ) : null}
            </div>
          ) : null}
        </div>

        {queued ? (
          <Text className="mt-1">
            Waiting for {blocker?.stage.name ?? 'the previous stage'}
          </Text>
        ) : null}

        {task.status === 'ON_HOLD' ? (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm/5 text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200">
            On hold{reason ? `: ${reason}` : ''}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          <Assignee
            task={task}
            operators={operators}
            canAssign={active}
            pending={pending}
            run={run}
          />
          {task.startedAt ? (
            <span>
              Started <LocalTime value={task.startedAt} />
            </span>
          ) : null}
          {task.completedAt ? (
            <span>
              {task.status === 'SKIPPED' ? 'Skipped' : 'Finished'}{' '}
              <LocalTime value={task.completedAt} />
              {task.completedBy ? ` by ${task.completedBy.name}` : ''}
            </span>
          ) : null}
          {duration ? (
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {duration}
            </span>
          ) : null}
        </div>

        <Notes key={task.notes ?? ''} task={task} canEdit={active && canUpdate} run={run} />
      </div>
    </li>
  )
}

function Assignee({
  task,
  operators,
  canAssign,
  pending,
  run,
}: {
  task: OrderTask
  operators: OperatorOption[]
  canAssign: boolean
  pending: boolean
  run: (action: () => Promise<SimpleResult>) => void
}) {
  const person = task.assignedTo

  const face = person ? (
    <>
      <Avatar
        initials={initials(person.name)}
        className="size-5 bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
      />
      <span>{person.name}</span>
    </>
  ) : (
    <span>Unassigned</span>
  )

  if (!canAssign) {
    return <span className="inline-flex items-center gap-1.5">{face}</span>
  }

  return (
    <Dropdown>
      <DropdownButton
        plain
        disabled={pending}
        className="-mx-2 -my-1 px-2 py-1 text-xs/5! font-normal"
        aria-label={`Assign ${task.stage.name}`}
      >
        {face}
        <span className="text-blue-600 dark:text-blue-400">
          {person ? 'Change' : 'Assign'}
        </span>
      </DropdownButton>
      <DropdownMenu anchor="bottom start">
        {operators.map((operator) => (
          <DropdownItem
            key={operator.id}
            onClick={() => run(() => assignTask(task.id, operator.id))}
          >
            <DropdownLabel>{operator.name}</DropdownLabel>
          </DropdownItem>
        ))}
        {person ? (
          <>
            <DropdownDivider />
            <DropdownItem onClick={() => run(() => assignTask(task.id, null))}>
              <DropdownLabel>Clear assignment</DropdownLabel>
            </DropdownItem>
          </>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  )
}

function Notes({
  task,
  canEdit,
  run,
}: {
  task: OrderTask
  canEdit: boolean
  run: (action: () => Promise<SimpleResult>) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(task.notes ?? '')
  const saved = useRef(task.notes ?? '')

  function save() {
    if (draft.trim() === saved.current.trim()) {
      return
    }

    saved.current = draft
    run(() => saveTaskNotes(task.id, draft))
  }

  if (!open) {
    if (!task.notes && !canEdit) {
      return null
    }

    return (
      <div className="mt-2 text-sm/5">
        {task.notes ? (
          <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
            {task.notes}
          </p>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs/5 text-blue-600 hover:underline dark:text-blue-400"
          >
            {task.notes ? 'Edit notes' : 'Add a note'}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-2 grid grid-cols-1 gap-2">
      <Textarea
        aria-label={`Notes for ${task.stage.name}`}
        rows={3}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        placeholder="Anything the next person should know"
      />
      <div className="flex gap-2">
        <Button
          onClick={() => {
            save()
            setOpen(false)
          }}
        >
          Save
        </Button>
        <Button
          plain
          onClick={() => {
            setDraft(saved.current)
            setOpen(false)
          }}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
