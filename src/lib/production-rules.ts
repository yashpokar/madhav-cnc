/**
 * Pure rules for the production workflow: which stage is next, what may be
 * started out of order, how progress and time read. No database or UI here so
 * the rules can be tested on their own and shared by the order page, the board
 * and the server actions.
 */

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'DONE'
  | 'SKIPPED'

export type RuleTask = {
  id: string
  position: number
  status: TaskStatus
  startedAt?: Date | null
  completedAt?: Date | null
}

/** How a stage should be presented. */
export type StageState =
  /** Done or skipped. */
  | 'finished'
  /** Being worked on now. */
  | 'active'
  /** Paused; the stage can be resumed. */
  | 'held'
  /** The next stage in line: the one to start. */
  | 'next'
  /** Waiting for an earlier stage to finish. */
  | 'queued'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function isFinished(status: TaskStatus) {
  return status === 'DONE' || status === 'SKIPPED'
}

export function sortTasks<T extends RuleTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => a.position - b.position)
}

/** The first stage that is not yet done or skipped, or null when all are. */
export function headTask<T extends RuleTask>(tasks: readonly T[]): T | null {
  return sortTasks(tasks).find((task) => !isFinished(task.status)) ?? null
}

/**
 * The stage to act on next: the first unfinished one. It is "Start" when
 * pending, "Mark done" when in progress and "Resume" when on hold.
 */
export function nextActionableTask<T extends RuleTask>(
  tasks: readonly T[],
): T | null {
  return headTask(tasks)
}

/** The unfinished stage ahead of this one that it is waiting for, if any. */
export function blockingTask<T extends RuleTask>(
  tasks: readonly T[],
  taskId: string,
): T | null {
  const sorted = sortTasks(tasks)
  const task = sorted.find((entry) => entry.id === taskId)

  if (!task) {
    return null
  }

  const ahead = sorted.filter(
    (entry) => entry.position < task.position && !isFinished(entry.status),
  )

  return ahead.length > 0 ? ahead[ahead.length - 1] : null
}

export function stageState(
  tasks: readonly RuleTask[],
  taskId: string,
): StageState {
  const task = tasks.find((entry) => entry.id === taskId)

  if (!task) {
    return 'queued'
  }

  if (isFinished(task.status)) return 'finished'
  if (task.status === 'IN_PROGRESS') return 'active'
  if (task.status === 'ON_HOLD') return 'held'

  return blockingTask(tasks, taskId) ? 'queued' : 'next'
}

/** True when starting or resuming this stage skips over an unfinished earlier one. */
export function startNeedsForce(
  tasks: readonly RuleTask[],
  taskId: string,
): boolean {
  return blockingTask(tasks, taskId) !== null
}

/** The stage that follows this one and is still pending, for "start the next one". */
export function followingTask<T extends RuleTask>(
  tasks: readonly T[],
  taskId: string,
): T | null {
  const sorted = sortTasks(tasks)
  const index = sorted.findIndex((entry) => entry.id === taskId)

  if (index === -1) {
    return null
  }

  const next = sorted.slice(index + 1).find((entry) => !isFinished(entry.status))

  return next && next.status === 'PENDING' ? next : null
}

export function progressCounts(tasks: readonly RuleTask[]) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'DONE').length
  const skipped = tasks.filter((task) => task.status === 'SKIPPED').length
  const finished = done + skipped

  return {
    total,
    done,
    skipped,
    finished,
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    onHold: tasks.filter((task) => task.status === 'ON_HOLD').length,
    percent: total === 0 ? 0 : Math.round((finished / total) * 100),
    complete: total > 0 && finished === total,
  }
}

/** 35m, 2h 10m, 1d 3h. Anything under a minute reads "under a minute". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) {
    return 'under a minute'
  }

  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  return `${minutes}m`
}

/** "took 2h 10m" for a finished stage, "running 35m" for one in progress. */
export function taskDurationLabel(task: RuleTask, now: Date): string | null {
  if (!task.startedAt) {
    return null
  }

  if (task.status === 'DONE' && task.completedAt) {
    return `took ${formatDuration(task.completedAt.getTime() - task.startedAt.getTime())}`
  }

  if (task.status === 'IN_PROGRESS') {
    return `running ${formatDuration(now.getTime() - task.startedAt.getTime())}`
  }

  return null
}

/** Time since the first stage started; stops at the last finish once all are done. */
export function totalElapsedMs(
  tasks: readonly RuleTask[],
  now: Date,
): number | null {
  const starts = tasks
    .map((task) => task.startedAt?.getTime())
    .filter((value): value is number => typeof value === 'number')

  if (starts.length === 0) {
    return null
  }

  const start = Math.min(...starts)
  const counts = progressCounts(tasks)

  if (counts.complete) {
    const ends = tasks
      .map((task) => task.completedAt?.getTime())
      .filter((value): value is number => typeof value === 'number')

    if (ends.length > 0) {
      return Math.max(0, Math.max(...ends) - start)
    }
  }

  return Math.max(0, now.getTime() - start)
}

export type DueTone = 'overdue' | 'soon' | 'ok'

const IST_OFFSET = 5.5 * HOUR

/** Whole days from today (India calendar day) to a date-only due date stored as UTC midnight. */
export function daysUntil(dueDate: Date, now: Date): number {
  const today = Math.floor((now.getTime() + IST_OFFSET) / DAY)
  const due = Math.floor(dueDate.getTime() / DAY)

  return due - today
}

/** "Due in 3 days", "Due today", "Overdue by 2 days". */
export function dueLabel(
  dueDate: Date,
  now: Date,
): { text: string; tone: DueTone; days: number } {
  const days = daysUntil(dueDate, now)
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`

  if (days < 0) {
    return { text: `Overdue by ${plural(-days)}`, tone: 'overdue', days }
  }

  if (days === 0) {
    return { text: 'Due today', tone: 'soon', days }
  }

  if (days === 1) {
    return { text: 'Due tomorrow', tone: 'soon', days }
  }

  return { text: `Due in ${plural(days)}`, tone: days <= 3 ? 'soon' : 'ok', days }
}

const REOPENABLE_ORDER_STATUSES = ['IN_PRODUCTION', 'READY']

/**
 * A finished stage may be reopened only if it is the latest finished one (so
 * nothing later is built on it) and the order has not shipped or closed, since
 * reopening can move the order back.
 */
export function reopenCheck(
  tasks: readonly RuleTask[],
  taskId: string,
  orderStatus: string,
): { ok: true } | { ok: false; reason: string } {
  const task = tasks.find((entry) => entry.id === taskId)

  if (!task || !isFinished(task.status)) {
    return { ok: false, reason: 'Only a finished stage can be reopened' }
  }

  if (!REOPENABLE_ORDER_STATUSES.includes(orderStatus)) {
    return {
      ok: false,
      reason: 'The order has already moved on, so this stage cannot be reopened',
    }
  }

  const latest = sortTasks(tasks)
    .filter((entry) => isFinished(entry.status))
    .at(-1)

  if (!latest || latest.id !== taskId) {
    return {
      ok: false,
      reason: 'Only the latest finished stage can be reopened',
    }
  }

  return { ok: true }
}

export function canSkip(status: TaskStatus) {
  return !isFinished(status)
}

export function canHold(status: TaskStatus) {
  return status === 'IN_PROGRESS'
}

/** Appends a labelled reason to existing notes; unchanged when there is no reason. */
export function reasonNote(
  existing: string | null | undefined,
  label: string,
  reason: string | null | undefined,
): string | null {
  const clean = reason?.trim()

  if (!clean) {
    return existing ?? null
  }

  const line = `${label}: ${clean}`

  return existing?.trim() ? `${existing.trim()}\n${line}` : line
}

/** The reason for an on-hold banner: the last "On hold:" line of the notes. */
export function holdReason(notes: string | null | undefined): string | null {
  const lines = (notes ?? '')
    .split('\n')
    .filter((line) => line.startsWith('On hold:'))
  const last = lines.at(-1)

  return last ? last.slice('On hold:'.length).trim() || null : null
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
