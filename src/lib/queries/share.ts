import { prisma } from '@/lib/prisma'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function optionalNum(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
}

export async function findShareByToken(token: string) {
  if (!token || token.length < 20) {
    return null
  }

  return prisma.quotationShare.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      isRevoked: true,
      expiresAt: true,
      decision: true,
      respondedAt: true,
      respondedByName: true,
      responseNote: true,
      quotationId: true,
    },
  })
}

export function shareIsUsable(share: {
  isRevoked: boolean
  expiresAt: Date | null
}) {
  if (share.isRevoked) {
    return false
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return false
  }

  return true
}

export async function getSharedQuotation(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      number: true,
      revision: true,
      status: true,
      subject: true,
      quotationDate: true,
      validUntil: true,
      siteAddress: true,
      siteCity: true,
      sitePincode: true,
      discountType: true,
      subtotal: true,
      discountAmount: true,
      taxableAmount: true,
      taxAmount: true,
      roundOff: true,
      total: true,
      advancePercent: true,
      notes: true,
      terms: true,
      customer: {
        select: { name: true, phone: true, city: true },
      },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          description: true,
          unit: true,
          materialSupply: true,
          dimensionUnit: true,
          length: true,
          width: true,
          pieces: true,
          quantity: true,
          rate: true,
          discountPercent: true,
          taxRatePercent: true,
          amount: true,
          taxAmount: true,
          lineTotal: true,
        },
      },
      attachments: {
        where: { removedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          comment: true,
          createdAt: true,
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          attachmentId: true,
          body: true,
          authorType: true,
          authorName: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  })

  if (!quotation) {
    return null
  }

  return {
    ...quotation,
    subtotal: num(quotation.subtotal),
    discountAmount: num(quotation.discountAmount),
    taxableAmount: num(quotation.taxableAmount),
    taxAmount: num(quotation.taxAmount),
    roundOff: num(quotation.roundOff),
    total: num(quotation.total),
    advancePercent: num(quotation.advancePercent),
    lines: quotation.lines.map((line) => ({
      ...line,
      length: optionalNum(line.length),
      width: optionalNum(line.width),
      pieces: optionalNum(line.pieces),
      quantity: num(line.quantity),
      rate: num(line.rate),
      discountPercent: num(line.discountPercent),
      taxRatePercent: num(line.taxRatePercent),
      amount: num(line.amount),
      taxAmount: num(line.taxAmount),
      lineTotal: num(line.lineTotal),
    })),
  }
}

export async function getPublicCompany() {
  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: {
      companyName: true,
      addressLine: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstin: true,
      bankAccountName: true,
      bankName: true,
      bankBranch: true,
      accountNumber: true,
      ifscCode: true,
      upiId: true,
      upiQrStoredName: true,
      upiQrMimeType: true,
      logoStoredName: true,
    },
  })

  return setting
}

export async function attachmentBelongsToQuotation(
  attachmentId: string,
  quotationId: string,
) {
  const attachment = await prisma.quotationAttachment.findFirst({
    where: { id: attachmentId, quotationId, removedAt: null },
    select: { storedName: true, mimeType: true, fileName: true },
  })

  return attachment
}

export type SharedQuotation = NonNullable<
  Awaited<ReturnType<typeof getSharedQuotation>>
>
export type PublicCompany = Awaited<ReturnType<typeof getPublicCompany>>
