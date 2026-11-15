import { taskAction } from '@/lib/api/production-route'
import { startTaskBody } from '@/lib/api/schemas/writes'
import { startTask } from '@/lib/services/production'

/** Starts (or resumes) a stage. It must be next in line unless an administrator sends force: true. */
export const POST = taskAction(startTaskBody, ({ actor, taskId, body }) => startTask(actor, taskId, body))
