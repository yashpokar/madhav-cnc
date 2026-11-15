import { taskAction } from '@/lib/api/production-route'
import { taskReasonBody } from '@/lib/api/schemas/writes'
import { holdTask } from '@/lib/services/production'

/** Puts a stage that is in progress on hold, with an optional reason. */
export const POST = taskAction(taskReasonBody, ({ actor, taskId, body }) => holdTask(actor, taskId, body.reason))
