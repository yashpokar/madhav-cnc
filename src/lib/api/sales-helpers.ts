import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'

// Ownership checks for nested records in the sales endpoints. Each runs inside the
// request's company scope, so another company's record is 404 as well.

/** The image must belong to this quotation, else 404. */
export async function requireAttachment(quotationId: string, attachmentId: string) {
  const found = await prisma.quotationAttachment.findFirst({
    where: { id: attachmentId, quotationId },
    select: { id: true },
  })

  if (!found) throw new ApiError('NOT_FOUND', 'Image not found.')
}

/** The allocation of this payment to this invoice (its id), else 404. */
export async function requireAllocation(invoiceId: string, paymentId: string): Promise<string> {
  const found = await prisma.paymentAllocation.findFirst({
    where: { paymentId, invoiceId },
    select: { id: true },
  })

  if (!found) throw new ApiError('NOT_FOUND', 'Payment not found on this invoice.')

  return found.id
}

/** The write-off must belong to this invoice, else 404. */
export async function requireWriteOff(invoiceId: string, writeOffId: string) {
  const found = await prisma.invoiceWriteOff.findFirst({
    where: { id: writeOffId, invoiceId },
    select: { id: true },
  })

  if (!found) throw new ApiError('NOT_FOUND', 'Write-off not found.')
}

/** 404 unless the record (read through its scoped query) exists. */
export function requireFound(row: unknown, what: string) {
  if (!row) throw new ApiError('NOT_FOUND', `${what} not found.`)
}
