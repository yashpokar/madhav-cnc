'use client'

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  ChatBubbleLeftEllipsisIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PlusIcon,
} from '@heroicons/react/20/solid'
import {
  CheckIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/react/16/solid'
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
  currentTask,
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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

  const current = currentTask(tasks)
  const total = now ? totalElapsedMs(tasks, now) : null
  const due = dueDate && now ? dueLabel(dueDate, now) : null

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Subheading level={2}>Production</Subheading>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm/6 text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-950 tabular-nums dark:text-white">
                {counts.finished} of {counts.total}
              </span>{' '}
              complete
              {counts.skipped > 0 ? ` (${counts.skipped} skipped)` : ''}
            </span>
            {total !== null ? (
              <Badge color="zinc">
                {formatDuration(total)}
                {counts.complete ? ' in total' : ' elapsed'}
              </Badge>
            ) : null}
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

        <ol
          className="flex gap-1.5"
          aria-label={`${counts.finished} of ${counts.total} stages complete`}
        >
          {tasks.map((task) => {
            const isCurrent = task.id === current?.id

            return (
              <li
                key={task.id}
                title={`${task.stage.name}: ${STATUS_LABELS[task.status]}`}
                className="min-w-0 flex-1"
              >
                <div
                  className={`h-1.5 rounded-full ${
                    isCurrent && task.status === 'PENDING'
                      ? 'bg-blue-500/40'
                      : SEGMENT_STYLES[task.status]
                  }`}
                />
                <div
                  className={`mt-1.5 hidden truncate text-xs/5 sm:block ${
                    isCurrent
                      ? 'font-medium text-zinc-950 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {task.stage.name}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <ol className="grid grid-cols-1">
        {tasks.map((task, index) => {
          const isCurrent = task.id === current?.id

          return (
            <StageRow
              key={task.id}
              task={task}
              tasks={tasks}
              last={index === tasks.length - 1}
              state={stageState(tasks, task.id)}
              current={isCurrent}
              open={expanded[task.id] ?? isCurrent}
              onToggle={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [task.id]: !(prev[task.id] ?? isCurrent),
                }))
              }
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
          )
        })}
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

/** The marker on the rail: one distinct shape per state. */
function StageNode({
  task,
  state,
}: {
  task: OrderTask
  state: StageState
}) {
  const base = 'relative grid size-7 shrink-0 place-items-center rounded-full'

  if (task.status === 'DONE') {
    return (
      <span className={`${base} bg-lime-500 text-white`}>
        <CheckIcon className="size-4" aria-hidden />
      </span>
    )
  }

  if (task.status === 'SKIPPED') {
    return (
      <span className={`${base} bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300`}>
        <ForwardIcon className="size-4" aria-hidden />
      </span>
    )
  }

  if (task.status === 'IN_PROGRESS') {
    return (
      <span className={`${base} bg-blue-500 text-white`}>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-blue-500/40 motion-safe:animate-ping"
        />
        <PlayIcon className="relative size-4 translate-x-px" aria-hidden />
      </span>
    )
  }

  if (task.status === 'ON_HOLD') {
    return (
      <span className={`${base} bg-amber-400 text-amber-950`}>
        <PauseIcon className="size-4" aria-hidden />
      </span>
    )
  }

  return (
    <span
      className={`${base} bg-white text-xs/none font-medium tabular-nums dark:bg-zinc-900 ${
        state === 'next'
          ? 'text-blue-600 ring-2 ring-blue-500 dark:text-blue-400'
          : 'text-zinc-500 ring-1 ring-zinc-950/15 dark:text-zinc-400 dark:ring-white/20'
      }`}
    >
      {task.position}
    </span>
  )
}

function StageRow({
  task,
  tasks,
  last,
  state,
  current,
  open,
  onToggle,
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
  open: boolean
  onToggle: () => void
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
  const [notesOpen, setNotesOpen] = useState(false)
  const bodyId = useId()
  const blocker = blockingTask(tasks, task.id)
  const duration = now ? taskDurationLabel(task, now) : null
  const reopen = reopenCheck(tasks, task.id, orderStatus)
  const outOfOrder = startNeedsForce(tasks, task.id)
  const queued = state === 'queued'
  const finished = state === 'finished'
  const reason = task.status === 'ON_HOLD' ? holdReason(task.notes) : null
  const person = task.assignedTo
  const canEditNotes = active && canUpdate

  const hasMenu =
    active &&
    (state === 'active' ||
      state === 'held' ||
      state === 'next' ||
      state === 'queued' ||
      (finished && reopen.ok))

  const chip =
    task.status === 'IN_PROGRESS' ? (
      <Badge color="blue">In progress</Badge>
    ) : task.status === 'ON_HOLD' ? (
      <Badge color="amber">On hold</Badge>
    ) : task.status === 'DONE' ? (
      <Badge color="lime" className="max-sm:hidden">
        Done
      </Badge>
    ) : task.status === 'SKIPPED' ? (
      <Badge color="zinc">Skipped</Badge>
    ) : null

  return (
    <li className="relative pl-10">
      {last ? null : (
        <span
          aria-hidden
          className={`absolute -bottom-2 left-3.5 w-px -translate-x-1/2 ${
            current ? 'top-10' : 'top-9'
          } ${
            finished ? 'bg-lime-500/60' : 'bg-zinc-950/10 dark:bg-white/10'
          }`}
        />
      )}
      <span className={`absolute left-0 ${current ? 'top-3' : 'top-2'}`}>
        <StageNode task={task} state={state} />
      </span>

      <div
        className={`-ml-2 rounded-xl pl-2 ${
          current
            ? 'my-1 bg-zinc-50 pr-2 pb-3 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10'
            : ''
        }`}
      >
        <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
            className="group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500 sm:flex-none"
          >
            <span
              className={`truncate text-sm/6 ${
                queued
                  ? 'text-zinc-600 dark:text-zinc-400'
                  : 'font-medium text-zinc-950 dark:text-white'
              }`}
            >
              {task.stage.name}
            </span>
            {chip}
            {queued ? (
              <span className="truncate text-sm/6 text-zinc-400 dark:text-zinc-500">
                Waiting for {blocker?.stage.name ?? 'the previous stage'}
              </span>
            ) : null}
            {finished ? (
              <span className="flex min-w-0 items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
                {person ? (
                  <Avatar
                    initials={initials(person.name)}
                    className="size-5 shrink-0 bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    aria-label={person.name}
                  />
                ) : null}
                {duration ? (
                  <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                    {duration}
                  </span>
                ) : null}
                {task.completedAt ? (
                  <span className="truncate max-sm:hidden">
                    <LocalTime value={task.completedAt} />
                  </span>
                ) : null}
              </span>
            ) : null}
            {task.notes && !open ? (
              <ChatBubbleLeftEllipsisIcon
                className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                aria-label="Has a note"
              />
            ) : null}
            <ChevronRightIcon
              aria-hidden
              className={`size-4 shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none dark:text-zinc-500 ${
                open ? 'rotate-90' : ''
              }`}
            />
          </button>

          {current ? (
            <div className="max-sm:basis-full">
              <Assignee
                task={task}
                operators={operators}
                canAssign={active}
                pending={pending}
                run={run}
              />
            </div>
          ) : null}

          <div
            className={`ml-auto flex items-center gap-1 ${
              current ? 'max-sm:order-last max-sm:w-full' : ''
            }`}
          >
            {active && state === 'next' ? (
              <Button
                className="max-sm:flex-1"
                disabled={pending}
                onClick={() => run(() => startTask(task.id))}
              >
                Start {task.stage.name}
              </Button>
            ) : null}
            {active && state === 'active' ? (
              <Button
                className="max-sm:flex-1"
                disabled={pending}
                onClick={() => run(() => completeTask(task.id))}
              >
                Mark done
              </Button>
            ) : null}
            {active && state === 'held' && !outOfOrder ? (
              <Button
                className="max-sm:flex-1"
                disabled={pending}
                onClick={() => run(() => startTask(task.id))}
              >
                Resume
              </Button>
            ) : null}

            {hasMenu ? (
              <Dropdown>
                <DropdownButton
                  plain
                  aria-label={`More actions for ${task.stage.name}`}
                >
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
                  {finished && reopen.ok ? (
                    <DropdownItem onClick={() => openDialogue({ kind: 'reopen', task })}>
                      <DropdownLabel>Reopen</DropdownLabel>
                    </DropdownItem>
                  ) : null}
                  {!finished ? (
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
        </div>

        {open ? (
          <div id={bodyId} className="grid grid-cols-1 gap-2 pb-2">
            {task.status === 'ON_HOLD' ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm/5 text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200">
                On hold{reason ? `: ${reason}` : ''}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
              {current ? null : (
                <Assignee
                  task={task}
                  operators={operators}
                  canAssign={active}
                  pending={pending}
                  run={run}
                />
              )}
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
              {duration && !finished ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {duration}
                </span>
              ) : null}
              {task.notes || canEditNotes ? (
                <button
                  type="button"
                  aria-expanded={notesOpen}
                  onClick={() => setNotesOpen((value) => !value)}
                  className="relative -my-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-zinc-600 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  <ChatBubbleLeftEllipsisIcon className="size-4 text-zinc-400 dark:text-zinc-500" aria-hidden />
                  {task.notes ? 'Note' : 'Add note'}
                  {task.notes ? (
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-blue-500"
                    />
                  ) : null}
                </button>
              ) : null}
            </div>

            {notesOpen ? (
              <Notes
                key={task.notes ?? ''}
                task={task}
                canEdit={canEditNotes}
                run={run}
                onClose={() => setNotesOpen(false)}
              />
            ) : null}
          </div>
        ) : null}
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
    <>
      <span className="grid size-5 place-items-center rounded-full border border-dashed border-zinc-400 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400">
        <PlusIcon className="size-3" aria-hidden />
      </span>
      <span>{canAssign ? 'Assign' : 'Unassigned'}</span>
    </>
  )

  if (!canAssign) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs/5">{face}</span>
    )
  }

  return (
    <Dropdown>
      <DropdownButton
        plain
        disabled={pending}
        className="gap-1.5! rounded-full! py-0.5! pr-2.5! pl-1! text-xs/5! font-normal text-zinc-700! dark:text-zinc-200! ring-1 ring-zinc-950/10 dark:ring-white/15"
        aria-label={person ? `Change assignee for ${task.stage.name}` : `Assign ${task.stage.name}`}
      >
        {face}
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
  onClose,
}: {
  task: OrderTask
  canEdit: boolean
  run: (action: () => Promise<SimpleResult>) => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState(canEdit && !task.notes)
  const [draft, setDraft] = useState(task.notes ?? '')
  const saved = useRef(task.notes ?? '')

  function save() {
    if (draft.trim() === saved.current.trim()) {
      return
    }

    saved.current = draft
    run(() => saveTaskNotes(task.id, draft))
  }

  if (!editing) {
    return (
      <div className="text-sm/5">
        <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
          {task.notes}
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 text-xs/5 text-blue-600 hover:underline dark:text-blue-400"
          >
            Edit note
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2">
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
            onClose()
          }}
        >
          Save
        </Button>
        <Button
          plain
          onClick={() => {
            setDraft(saved.current)
            onClose()
          }}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
