import { describe, expect, it } from 'vitest'
import {
  blockingTask,
  dueLabel,
  followingTask,
  formatDuration,
  holdReason,
  initials,
  nextActionableTask,
  progressCounts,
  reasonNote,
  reopenCheck,
  stageState,
  startNeedsForce,
  taskDurationLabel,
  totalElapsedMs,
  type RuleTask,
  type TaskStatus,
} from './production-rules'

const t = (
  position: number,
  status: TaskStatus,
  extra: Partial<RuleTask> = {},
): RuleTask => ({
  id: `t${position}`,
  position,
  status,
  ...extra,
})

describe('sequencing', () => {
  const tasks = [t(1, 'DONE'), t(2, 'PENDING'), t(3, 'PENDING'), t(4, 'PENDING')]

  it('picks the first unfinished stage as next', () => {
    expect(nextActionableTask(tasks)?.id).toBe('t2')
    expect(nextActionableTask([t(1, 'DONE'), t(2, 'SKIPPED')])).toBeNull()
  })

  it('treats a skipped stage as finished', () => {
    expect(nextActionableTask([t(1, 'SKIPPED'), t(2, 'PENDING')])?.id).toBe('t2')
  })

  it('separates next from queued', () => {
    expect(stageState(tasks, 't1')).toBe('finished')
    expect(stageState(tasks, 't2')).toBe('next')
    expect(stageState(tasks, 't3')).toBe('queued')
    expect(stageState(tasks, 't4')).toBe('queued')
  })

  it('reports active and held stages', () => {
    const list = [t(1, 'IN_PROGRESS'), t(2, 'PENDING'), t(3, 'ON_HOLD')]
    expect(stageState(list, 't1')).toBe('active')
    expect(stageState(list, 't2')).toBe('queued')
    expect(stageState(list, 't3')).toBe('held')
  })

  it('names the stage a queued stage waits for', () => {
    expect(blockingTask(tasks, 't4')?.id).toBe('t3')
    expect(blockingTask(tasks, 't2')).toBeNull()
  })

  it('needs force only when an earlier stage is unfinished', () => {
    expect(startNeedsForce(tasks, 't2')).toBe(false)
    expect(startNeedsForce(tasks, 't3')).toBe(true)
  })

  it('finds the following pending stage to auto-start', () => {
    expect(followingTask(tasks, 't2')?.id).toBe('t3')
    expect(followingTask([t(1, 'IN_PROGRESS'), t(2, 'ON_HOLD')], 't1')).toBeNull()
    expect(followingTask([t(1, 'IN_PROGRESS')], 't1')).toBeNull()
  })
})

describe('progress', () => {
  it('counts finished stages', () => {
    const counts = progressCounts([
      t(1, 'DONE'),
      t(2, 'SKIPPED'),
      t(3, 'IN_PROGRESS'),
      t(4, 'PENDING'),
    ])
    expect(counts).toMatchObject({
      total: 4,
      finished: 2,
      percent: 50,
      complete: false,
    })
  })

  it('is complete when everything is finished', () => {
    expect(progressCounts([t(1, 'DONE'), t(2, 'DONE')]).complete).toBe(true)
    expect(progressCounts([]).complete).toBe(false)
    expect(progressCounts([]).percent).toBe(0)
  })
})

describe('durations', () => {
  it('formats durations', () => {
    expect(formatDuration(10_000)).toBe('under a minute')
    expect(formatDuration(35 * 60_000)).toBe('35m')
    expect(formatDuration(130 * 60_000)).toBe('2h 10m')
    expect(formatDuration(2 * 3_600_000)).toBe('2h')
    expect(formatDuration(27 * 3_600_000)).toBe('1d 3h')
    expect(formatDuration(48 * 3_600_000)).toBe('2d')
  })

  it('labels finished and running stages', () => {
    const start = new Date('2026-11-14T10:00:00Z')
    const done = t(1, 'DONE', {
      startedAt: start,
      completedAt: new Date('2026-11-14T12:10:00Z'),
    })
    expect(taskDurationLabel(done, new Date())).toBe('took 2h 10m')

    const running = t(2, 'IN_PROGRESS', { startedAt: start })
    expect(taskDurationLabel(running, new Date('2026-11-14T10:35:00Z'))).toBe(
      'running 35m',
    )
    expect(taskDurationLabel(t(3, 'PENDING'), new Date())).toBeNull()
  })

  it('totals time since production started', () => {
    const start = new Date('2026-11-14T10:00:00Z')
    const now = new Date('2026-11-14T13:00:00Z')
    expect(totalElapsedMs([t(1, 'PENDING')], now)).toBeNull()
    expect(
      totalElapsedMs([t(1, 'IN_PROGRESS', { startedAt: start })], now),
    ).toBe(3 * 3_600_000)
    expect(
      totalElapsedMs(
        [
          t(1, 'DONE', {
            startedAt: start,
            completedAt: new Date('2026-11-14T11:00:00Z'),
          }),
        ],
        now,
      ),
    ).toBe(3_600_000)
  })
})

describe('due label', () => {
  const now = new Date('2026-11-15T06:00:00Z')

  it('counts days ahead', () => {
    expect(dueLabel(new Date('2026-11-18T00:00:00Z'), now)).toMatchObject({
      text: 'Due in 3 days',
      tone: 'soon',
    })
    expect(dueLabel(new Date('2026-11-30T00:00:00Z'), now).tone).toBe('ok')
    expect(dueLabel(new Date('2026-11-16T00:00:00Z'), now).text).toBe(
      'Due tomorrow',
    )
    expect(dueLabel(new Date('2026-11-15T00:00:00Z'), now).text).toBe('Due today')
  })

  it('flags overdue', () => {
    expect(dueLabel(new Date('2026-11-13T00:00:00Z'), now)).toMatchObject({
      text: 'Overdue by 2 days',
      tone: 'overdue',
    })
    expect(dueLabel(new Date('2026-11-14T00:00:00Z'), now).text).toBe(
      'Overdue by 1 day',
    )
  })
})

describe('reopen', () => {
  const tasks = [t(1, 'DONE'), t(2, 'DONE'), t(3, 'PENDING')]

  it('allows the latest finished stage only', () => {
    expect(reopenCheck(tasks, 't2', 'IN_PRODUCTION').ok).toBe(true)
    expect(reopenCheck(tasks, 't1', 'IN_PRODUCTION').ok).toBe(false)
    expect(reopenCheck(tasks, 't3', 'IN_PRODUCTION').ok).toBe(false)
  })

  it('refuses once the order has moved on', () => {
    expect(reopenCheck(tasks, 't2', 'DISPATCHED').ok).toBe(false)
    expect(reopenCheck(tasks, 't2', 'COMPLETED').ok).toBe(false)
    expect(reopenCheck(tasks, 't2', 'READY').ok).toBe(true)
  })
})

describe('notes helpers', () => {
  it('appends reasons and reads the hold reason back', () => {
    const notes = reasonNote('Check finish', 'On hold', 'Waiting for supplies')
    expect(notes).toBe('Check finish\nOn hold: Waiting for supplies')
    expect(holdReason(notes)).toBe('Waiting for supplies')
    expect(reasonNote('x', 'On hold', '  ')).toBe('x')
    expect(holdReason('nothing')).toBeNull()
  })

  it('makes initials', () => {
    expect(initials('Yash Pokar')).toBe('YP')
    expect(initials('madonna')).toBe('MA')
    expect(initials('')).toBe('?')
  })
})
