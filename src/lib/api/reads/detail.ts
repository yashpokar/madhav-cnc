import { ApiError } from '@/lib/api/errors'
import type { ApiUser } from '@/lib/api/auth'
import {
  customerDetailOut,
  expenseDetailOut,
  invoiceDetailOut,
  orderDetailOut,
  paymentDetailOut,
  productionTaskOut,
  quotationDetailOut,
} from '@/lib/api/reads/mappers'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'
import { getCustomer } from '@/lib/queries/customers'
import { getQuotation } from '@/lib/queries/quotations'
import { getOrder } from '@/lib/queries/orders'
import { getInvoice } from '@/lib/queries/invoices'
import { getReceipt, customerAccount } from '@/lib/queries/payments'
import { getExpense } from '@/lib/queries/accounting'

// The same detail shapes GET /{resource}/{id} answers, for the write endpoints
// to hand back what they just saved. Each reads inside the request's company
// scope, so another company's id is a 404 here too.

const missing = (what: string) => new ApiError('NOT_FOUND', `${what} not found.`)

export async function customerDetailFor(user: ApiUser, id: string) {
  const row = await getCustomer(id)

  if (!row) throw missing('Customer')

  return customerDetailOut(row, can(user.role, 'invoice:read') ? await customerAccount(row.id) : null)
}

export async function quotationDetailFor(id: string) {
  const row = await getQuotation(id)

  if (!row) throw missing('Quotation')

  return quotationDetailOut(row)
}

export async function orderDetailFor(id: string) {
  const row = await getOrder(id)

  if (!row) throw missing('Order')

  return orderDetailOut(row)
}

export async function invoiceDetailFor(id: string) {
  const row = await getInvoice(id)

  if (!row) throw missing('Invoice')

  return invoiceDetailOut(row)
}

export async function paymentDetailFor(id: string) {
  const row = await getReceipt(id)

  if (!row) throw missing('Payment')

  return paymentDetailOut(row)
}

export async function expenseDetailFor(id: string) {
  const row = await getExpense(id)

  if (!row) throw missing('Expense')

  return expenseDetailOut(row)
}

/** One production task in the shape the board list uses (the order may already have left the board). */
export async function productionTaskFor(id: string) {
  const row = await prisma.productionTask.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      position: true,
      startedAt: true,
      completedAt: true,
      updatedAt: true,
      notes: true,
      stage: { select: { id: true, name: true, sortOrder: true } },
      assignedTo: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          number: true,
          status: true,
          subject: true,
          dueDate: true,
          customer: { select: { name: true } },
        },
      },
    },
  })

  if (!row) throw missing('Task')

  return productionTaskOut(row as Parameters<typeof productionTaskOut>[0])
}
