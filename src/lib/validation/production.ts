import { z } from 'zod'

/** A production stage name (JSON-native; used by the stages server actions and the API). */
export const stageNameSchema = z.string().trim().min(1, 'Stage name is required').max(60)

/** The order statuses a stage may be linked to. */
export const STAGE_LINKED_STATUSES = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DISPATCHED',
  'COMPLETED',
] as const

export type StageLinkedStatus = (typeof STAGE_LINKED_STATUSES)[number]

export const taskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'ON_HOLD',
  'DONE',
  'SKIPPED',
])

/** Optional reason for holding or skipping a stage (trimmed and cut to 500 by the service). */
export const taskReasonSchema = z.string().optional()

export const startTaskInputSchema = z.object({ force: z.boolean().optional() })
export const completeTaskInputSchema = z.object({ startNext: z.boolean().optional() })
export const assignTaskInputSchema = z.object({ userId: z.string().min(1).nullable() })
