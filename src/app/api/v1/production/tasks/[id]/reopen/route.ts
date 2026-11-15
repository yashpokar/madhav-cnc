import { z } from 'zod'
import { taskAction } from '@/lib/api/production-route'
import { reopenTask } from '@/lib/services/production'

/** Reopens the latest finished stage (the order falls back to what the remaining finished stages justify). */
export const POST = taskAction(z.object({}).default({}), ({ actor, taskId }) => reopenTask(actor, taskId))
