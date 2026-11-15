import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'

/** Stops pushes to this phone (call it on sign-out). Only the person's own device; anyone else's id is 404. */
export const DELETE = apiRoute({ auth: 'user' }, async ({ params, user }) => {
  const removed = await prisma.deviceToken.deleteMany({ where: { id: params.id, userId: user.id } })

  if (removed.count === 0) throw new ApiError('NOT_FOUND', 'Device not found.')

  return reply({ id: params.id, deleted: true })
})
