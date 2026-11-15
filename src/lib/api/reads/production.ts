import type { CursorPosition } from '@/lib/api/cursor'
import { day } from '@/lib/api/reads/format'
import { listBoardTasks, type BoardTask } from '@/lib/queries/production'
import type { ProductionTaskStatus } from '@/generated/prisma/enums'

/** The sort position of a task: orders by due date (undated last), then order number, then stage position. */
const sortKey = (task: BoardTask) =>
  `${task.order.dueDate ? day(task.order.dueDate) : '9999-12-31'}|${task.order.number}|${String(task.position).padStart(4, '0')}`

export const positionOf = (task: BoardTask): CursorPosition => ({ k: sortKey(task), id: task.id })

/**
 * Production tasks of the orders being worked on (the board's rows; the set is
 * limited by those orders, not by history), one page. Open means not done or
 * skipped unless a status is asked for. The board query has no cursor, so the
 * page is cut here from a stable (due date, order number, stage position, id) order.
 */
export async function listTaskPage({
  search,
  status,
  limit,
  after,
}: {
  search?: string
  status?: ProductionTaskStatus
  limit: number
  after?: CursorPosition | null
}): Promise<BoardTask[]> {
  const rows = await listBoardTasks({ search })

  return rows
    .filter((task) => (status ? task.status === status : task.status !== 'DONE' && task.status !== 'SKIPPED'))
    .map((task) => ({ task, key: sortKey(task) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.task.id < b.task.id ? -1 : 1))
    .filter(({ task, key }) => !after || key > String(after.k) || (key === String(after.k) && task.id > after.id))
    .slice(0, limit + 1)
    .map(({ task }) => task)
}
