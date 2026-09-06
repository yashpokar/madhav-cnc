import { prisma } from '@/lib/prisma'
import type { InvoiceStatus } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

export type PaymentState = 'UNPAID' | 'PART_PAID' | 'PAID'

export function paymentState(
  total: number,
  advanceAdjusted: number,
  paid: number,
): PaymentState {
  const due = Math.round((total - advanceAdjusted - paid) * 100) / 100

  if (due <= 0) return 'PAID'
  if (paid > 0 || advanceAdjusted > 0) return 'PART_PAID'
  return 'UNPAID'
}

export async function listInvoices({
  search,
  status,
}: {
  search?: string
  status?: InvoiceStatus
} = {}) {
  const term = search?.trim()

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { customer: { name: { contains: term, mode: 'insensitive' } } },
              { customer: { phone: { contains: term } } },
              { order: { number: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      invoiceDate: true,
      dueDate: true,
      total: true,
      advanceAdjusted: true,
      isInterState: true,
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
      paymentAllocations: { select: { amount: true } },
    },
  })

  return invoices.map(({ paymentAllocations, ...invoice }) => {
    const paid = paymentAllocations.reduce(
      (sum, allocation) => sum + num(allocation.amount),
      0,
    )
    const total = num(invoice.total)
    const advanceAdjusted = num(invoice.advanceAdjusted)

    return {
      ...invoice,
      total,
      advanceAdjusted,
      paid: Math.round(paid * 100) / 100,
      due: Math.round((total - advanceAdjusted - paid) * 100) / 100,
      paymentState: paymentState(total, advanceAdjusted, paid),
    }
  })
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      order: { select: { id: true, number: true, subject: true } },
      createdBy: { select: { name: true } },
      lines: { orderBy: { position: 'asc' } },
      paymentAllocations: {
        orderBy: { createdAt: 'desc' },
        include: {
          payment: {
            include: { recordedBy: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!invoice) {
    return null
  }

  const paid = invoice.paymentAllocations.reduce(
    (sum, allocation) => sum + num(allocation.amount),
    0,
  )
  const total = num(invoice.total)
  const advanceAdjusted = num(invoice.advanceAdjusted)

  return {
    ...invoice,
    discountValue: num(invoice.discountValue),
    transportCharge: num(invoice.transportCharge),
    transportTaxRatePercent: num(invoice.transportTaxRatePercent),
    subtotal: num(invoice.subtotal),
    discountAmount: num(invoice.discountAmount),
    taxableAmount: num(invoice.taxableAmount),
    cgstAmount: num(invoice.cgstAmount),
    sgstAmount: num(invoice.sgstAmount),
    igstAmount: num(invoice.igstAmount),
    taxAmount: num(invoice.taxAmount),
    roundOff: num(invoice.roundOff),
    total,
    advanceAdjusted,
    paid: Math.round(paid * 100) / 100,
    due: Math.round((total - advanceAdjusted - paid) * 100) / 100,
    paymentState: paymentState(total, advanceAdjusted, paid),
    lines: invoice.lines.map((line) => ({
      ...line,
      quantity: num(line.quantity),
      rate: num(line.rate),
      discountPercent: num(line.discountPercent),
      taxRatePercent: num(line.taxRatePercent),
      amount: num(line.amount),
      cgstAmount: num(line.cgstAmount),
      sgstAmount: num(line.sgstAmount),
      igstAmount: num(line.igstAmount),
      lineTotal: num(line.lineTotal),
    })),
    payments: invoice.paymentAllocations.map((allocation) => ({
      id: allocation.id,
      paymentId: allocation.payment.id,
      number: allocation.payment.number,
      paidOn: allocation.payment.paidOn,
      mode: allocation.payment.mode,
      reference: allocation.payment.reference,
      recordedBy: allocation.payment.recordedBy,
      amount: num(allocation.amount),
      receiptAmount: num(allocation.payment.amount),
    })),
  }
}

export async function getOrderForInvoice(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      discountType: true,
      discountValue: true,
      transportCharge: true,
      transportTaxRatePercent: true,
      advanceAmount: true,
      terms: true,
      customer: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          gstin: true,
        },
      },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          itemId: true,
          description: true,
          hsnCode: true,
          unit: true,
          quantity: true,
          rate: true,
          discountPercent: true,
          taxRatePercent: true,
        },
      },
      invoices: { select: { id: true, number: true, status: true } },
    },
  })

  if (!order) {
    return null
  }

  return {
    ...order,
    discountValue: num(order.discountValue),
    transportCharge: num(order.transportCharge),
    transportTaxRatePercent: num(order.transportTaxRatePercent),
    advanceAmount: num(order.advanceAmount),
    lines: order.lines.map((line) => ({
      ...line,
      quantity: num(line.quantity),
      rate: num(line.rate),
      discountPercent: num(line.discountPercent),
      taxRatePercent: num(line.taxRatePercent),
    })),
  }
}

export async function listInvoiceableOrders() {
  return prisma.order.findMany({
    where: {
      status: { in: ['READY', 'DISPATCHED', 'COMPLETED', 'IN_PRODUCTION'] },
    },
    orderBy: { orderDate: 'desc' },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      total: true,
      customer: { select: { name: true } },
      invoices: { select: { id: true, number: true } },
    },
  })
}

export type InvoiceListItem = Awaited<ReturnType<typeof listInvoices>>[number]
export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>
