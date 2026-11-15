import { taskAction } from '@/lib/api/production-route'
import { taskReasonBody } from '@/lib/api/schemas/writes'
import { skipTask } from '@/lib/services/production'

/** Skips a stage that is not finished, with an optional reason. */
export const POST = taskAction(taskReasonBody, ({ actor, taskId, body }) => skipTask(actor, taskId, body.reason))
