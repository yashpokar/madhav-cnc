import { taskAction } from '@/lib/api/production-route'
import { assignTaskBody } from '@/lib/api/schemas/writes'
import { assignTask } from '@/lib/services/production'

/** Assigns the stage to a person of this company, or clears the assignment with userId: null. */
export const POST = taskAction(assignTaskBody, ({ actor, taskId, body }) => assignTask(actor, taskId, body.userId))
