import { prisma } from '@/lib/prisma'

export async function invalidateApproval(
  quotationId: string,
  reason: string,
): Promise<boolean> {
  const shares = await prisma.quotationShare.findMany({
    where: { quotationId, isRevoked: false, decision: { not: 'PENDING' } },
    select: {
      id: true,
      decision: true,
      respondedAt: true,
      respondedByName: true,
      responseNote: true,
    },
  })

  if (shares.length === 0) {
    return false
  }

  const now = new Date()

  await prisma.$transaction([
    prisma.quotationShareResponse.createMany({
      data: shares.map((share) => ({
        shareId: share.id,
        decision: share.decision,
        respondedByName: share.respondedByName,
        responseNote: share.responseNote,
        respondedAt: share.respondedAt ?? now,
        supersededAt: now,
        supersededReason: reason,
      })),
    }),
    prisma.quotationShare.updateMany({
      where: { id: { in: shares.map((share) => share.id) } },
      data: {
        decision: 'PENDING',
        respondedAt: null,
        respondedByName: null,
        responseNote: null,
        amendedAt: now,
      },
    }),
  ])

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { status: true },
  })

  if (
    quotation &&
    (quotation.status === 'ACCEPTED' || quotation.status === 'REJECTED')
  ) {
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'SENT' },
    })
  }

  return true
}
