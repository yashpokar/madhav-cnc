import { prisma } from '@/lib/prisma'
import type { QuotationStatus } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function optionalNum(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
}

export async function listQuotations({
  search,
  status,
}: {
  search?: string
  status?: QuotationStatus
} = {}) {
  const term = search?.trim()

  const quotations = await prisma.quotation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { subject: { contains: term, mode: 'insensitive' } },
              { customer: { name: { contains: term, mode: 'insensitive' } } },
              { customer: { phone: { contains: term } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      revision: true,
      status: true,
      materialSupply: true,
      subject: true,
      quotationDate: true,
      validUntil: true,
      total: true,
      customer: { select: { id: true, code: true, name: true } },
      architect: { select: { name: true } },
      carpenter: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  })

  return quotations.map((quotation) => ({
    ...quotation,
    total: num(quotation.total),
  }))
}

export async function getQuotation(id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      architect: { select: { id: true, code: true, name: true, phone: true } },
      carpenter: { select: { id: true, code: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      lines: { orderBy: { position: 'asc' } },
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          comment: true,
          removedAt: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
          removedBy: { select: { name: true } },
        },
      },
    },
  })

  if (!quotation) {
    return null
  }

  return {
    ...quotation,
    discountValue: num(quotation.discountValue),
    subtotal: num(quotation.subtotal),
    discountAmount: num(quotation.discountAmount),
    taxableAmount: num(quotation.taxableAmount),
    taxAmount: num(quotation.taxAmount),
    roundOff: num(quotation.roundOff),
    total: num(quotation.total),
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

export async function listCustomerOptions() {
  return prisma.customer.findMany({
    where: { status: { not: 'INACTIVE' } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      address: true,
      pincode: true,
      preferredArchitectId: true,
      preferredCarpenterId: true,
    },
  })
}

export async function listItemOptions() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      rate: true,
      taxRatePercent: true,
      hsnCode: true,
      brand: true,
      material: { select: { name: true } },
    },
  })

  return items.map((item) => ({
    ...item,
    rate: item.rate.toNumber(),
    taxRatePercent: item.taxRatePercent.toNumber(),
  }))
}

export type AttachmentItem = QuotationDetail['attachments'][number]

export type QuotationListItem = Awaited<
  ReturnType<typeof listQuotations>
>[number]
export type QuotationDetail = NonNullable<
  Awaited<ReturnType<typeof getQuotation>>
>
export type CustomerOption = Awaited<
  ReturnType<typeof listCustomerOptions>
>[number]
export type ItemOption = Awaited<ReturnType<typeof listItemOptions>>[number]
