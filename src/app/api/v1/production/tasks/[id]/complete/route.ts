import { taskAction } from '@/lib/api/production-route'
import { completeTaskBody } from '@/lib/api/schemas/writes'
import { completeTask } from '@/lib/services/production'

/** Finishes an in-progress stage and, unless startNext is false, starts the next pending one. */
export const POST = taskAction(completeTaskBody, ({ actor, taskId, body }) => completeTask(actor, taskId, body))
