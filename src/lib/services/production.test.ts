import { describe, expect, it } from 'vitest'
import {
  advanceTarget,
  orderRank,
  prettyStatus,
  retreatTarget,
  type StatusTask,
} from '@/lib/production-rules'
import {
  assignTaskInputSchema,
  stageNameSchema,
  STAGE_LINKED_STATUSES,
} from '@/lib/validation/production'

const task = (
  status: StatusTask['status'],
  linkedStatus: StatusTask['stage']['linkedStatus'],
): StatusTask => ({ status, stage: { linkedStatus } })

describe('advanceTarget', () => {
  it('moves to the furthest status reached by a finished stage', () => {
    expect(
      advanceTarget('CONFIRMED', [
        task('DONE', 'IN_PRODUCTION'),
        task('DONE', 'READY'),
        task('PENDING', 'DISPATCHED'),
      ]),
    ).toBe('READY')
  })

  it('counts skipped stages as finished', () => {
    expect(advanceTarget('IN_PRODUCTION', [task('SKIPPED', 'READY')])).toBe('READY')
  })

  it('ignores unfinished and unlinked stages', () => {
    expect(
      advanceTarget('CONFIRMED', [task('IN_PROGRESS', 'READY'), task('DONE', null)]),
    ).toBeNull()
  })

  it('never moves backwards or sideways', () => {
    expect(advanceTarget('READY', [task('DONE', 'IN_PRODUCTION')])).toBeNull()
    expect(advanceTarget('READY', [task('DONE', 'READY')])).toBeNull()
  })

  it('leaves cancelled orders and orders without tasks alone', () => {
    expect(advanceTarget('CANCELLED', [task('DONE', 'READY')])).toBeNull()
    expect(advanceTarget('CONFIRMED', [])).toBeNull()
  })
})

describe('retreatTarget', () => {
  it('falls back to the furthest status still justified', () => {
    expect(
      retreatTarget('READY', [task('DONE', 'IN_PRODUCTION'), task('IN_PROGRESS', 'READY')]),
    ).toBe('IN_PRODUCTION')
  })

  it('keeps the order where a finished stage still justifies it', () => {
    expect(retreatTarget('READY', [task('DONE', 'READY')])).toBeNull()
  })

  it('never goes below IN_PRODUCTION', () => {
    expect(retreatTarget('IN_PRODUCTION', [])).toBeNull()
    expect(retreatTarget('READY', [])).toBe('IN_PRODUCTION')
  })
})

describe('helpers', () => {
  it('ranks statuses in lifecycle order', () => {
    expect(orderRank('DRAFT')).toBeLessThan(orderRank('CONFIRMED'))
    expect(orderRank('DISPATCHED')).toBeLessThan(orderRank('COMPLETED'))
    expect(orderRank('CANCELLED')).toBe(-1)
  })

  it('writes statuses the way the activity trail reads', () => {
    expect(prettyStatus('IN_PRODUCTION')).toBe('in production')
    expect(prettyStatus('ON_HOLD')).toBe('on hold')
  })
})

describe('stage validation', () => {
  it('trims and requires a stage name', () => {
    expect(stageNameSchema.parse('  Cutting ')).toBe('Cutting')
    expect(stageNameSchema.safeParse('   ').success).toBe(false)
    expect(stageNameSchema.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('lists the statuses a stage may link to', () => {
    expect(STAGE_LINKED_STATUSES).not.toContain('DRAFT')
    expect(STAGE_LINKED_STATUSES).not.toContain('CANCELLED')
  })

  it('accepts a null assignee to clear the assignment', () => {
    expect(assignTaskInputSchema.safeParse({ userId: null }).success).toBe(true)
    expect(assignTaskInputSchema.safeParse({ userId: '' }).success).toBe(false)
  })
})
