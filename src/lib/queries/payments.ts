import { prisma } from '@/lib/prisma'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export async function openInvoiceBalances(
  customerId: string,
  ignorePaymentId?: string,
) {
  const invoices = await prisma.invoice.findMany({
    where: { customerId, status: 'ISSUED' },
    orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      total: true,
      advanceAdjusted: true,
      paymentAllocations: {
        select: { amount: true, paymentId: true },
      },
    },
  })

  return invoices
    .map((invoice) => {
      const paid = invoice.paymentAllocations
        .filter((allocation) => allocation.paymentId !== ignorePaymentId)
        .reduce((sum, allocation) => sum + num(allocation.amount), 0)

      return {
        id: invoice.id,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        total: num(invoice.total),
        paid: round2(paid + num(invoice.advanceAdjusted)),
        due: round2(num(invoice.total) - num(invoice.advanceAdjusted) - paid),
      }
    })
    .filter((invoice) => invoice.due > 0)
}

export async function getReceipt(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      recordedBy: { select: { name: true } },
      allocations: {
        orderBy: { createdAt: 'asc' },
        include: {
          invoice: {
            select: {
              id: true,
              number: true,
              invoiceDate: true,
              dueDate: true,
              total: true,
            },
          },
        },
      },
    },
  })

  if (!payment) {
    return null
  }

  const amount = num(payment.amount)
  const allocated = round2(
    payment.allocations.reduce(
      (sum, allocation) => sum + num(allocation.amount),
      0,
    ),
  )

  return {
    ...payment,
    amount,
    allocated,
    unallocated: round2(amount - allocated),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: num(allocation.amount),
      invoice: {
        ...allocation.invoice,
        total: num(allocation.invoice.total),
      },
    })),
  }
}

export async function customerAccount(customerId: string) {
  const [customer, invoices, receipts, credits] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true },
    }),
    openInvoiceBalances(customerId),
    prisma.payment.findMany({
      where: { customerId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        paidOn: true,
        amount: true,
        mode: true,
        reference: true,
        allocations: { select: { amount: true } },
      },
    }),
    prisma.creditDebitNote.findMany({
      where: {
        customerId,
        status: 'ISSUED',
        partyType: 'CUSTOMER',
        kind: 'CREDIT',
      },
      orderBy: { noteDate: 'desc' },
      select: {
        id: true,
        number: true,
        noteDate: true,
        reason: true,
        total: true,
      },
    }),
  ])

  if (!customer) {
    return null
  }

  const due = round2(invoices.reduce((sum, invoice) => sum + invoice.due, 0))
  const onAccount = round2(
    receipts.reduce((sum, receipt) => {
      const allocated = receipt.allocations.reduce(
        (total, allocation) => total + num(allocation.amount),
        0,
      )

      return sum + Math.max(0, num(receipt.amount) - allocated)
    }, 0),
  )
  const creditNotes = credits.map((note) => ({
    ...note,
    total: num(note.total),
  }))
  const credit = round2(
    creditNotes.reduce((sum, note) => sum + note.total, 0),
  )

  return {
    customer,
    invoices,
    due,
    onAccount,
    credit,
    creditNotes,
    net: round2(due - onAccount - credit),
    receipts: receipts.map((receipt) => {
      const allocated = round2(
        receipt.allocations.reduce(
          (sum, allocation) => sum + num(allocation.amount),
          0,
        ),
      )

      return {
        id: receipt.id,
        number: receipt.number,
        paidOn: receipt.paidOn,
        mode: receipt.mode,
        reference: receipt.reference,
        amount: num(receipt.amount),
        allocated,
        unallocated: round2(num(receipt.amount) - allocated),
      }
    }),
  }
}

export type OpenInvoice = Awaited<ReturnType<typeof openInvoiceBalances>>[number]
export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceipt>>>
export type CustomerAccount = NonNullable<
  Awaited<ReturnType<typeof customerAccount>>
>
