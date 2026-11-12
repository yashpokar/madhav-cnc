import { prisma } from '@/lib/prisma'

export type ActivityEntity =
  | 'customer'
  | 'quotation'
  | 'order'
  | 'invoice'
  | 'dispatch'
  | 'payment'
  | 'note'
  | 'expense'
  | 'expense-category'
  | 'cash-credit'
  | 'item'
  | 'material'
  | 'partner'
  | 'stage'
  | 'company'
  | 'user'

type Actor = { id: string; name: string } | null

/**
 * Records one line in a record's activity trail. It must never get in the way
 * of the action it describes, so failures are swallowed.
 *
 * `summary` reads as a sentence fragment after the person's name, e.g.
 * "marked the quotation as sent". Pass actor = null for the customer acting on
 * a shared link (shown as "Customer").
 */
export async function logActivity({
  entity,
  id,
  action,
  summary,
  actor,
}: {
  entity: ActivityEntity
  id: string
  action: string
  summary: string
  actor: Actor
}) {
  try {
    await prisma.activityLog.create({
      data: {
        entityType: entity,
        entityId: id,
        action,
        summary,
        userId: actor?.id ?? null,
        userName: actor?.name ?? 'Customer',
      },
    })
  } catch {
    // The trail is a convenience; losing a line is better than failing a save.
  }
}

export async function listActivity(entity: ActivityEntity, id: string, take = 30) {
  return prisma.activityLog.findMany({
    where: { entityType: entity, entityId: id },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      action: true,
      summary: true,
      userName: true,
      createdAt: true,
    },
  })
}
