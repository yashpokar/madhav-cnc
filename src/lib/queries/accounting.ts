import { prisma } from '@/lib/prisma'
import type { NoteKind, NoteStatus } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

export async function listExpenseCategories(activeOnly = false) {
  return prisma.expenseCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { expenses: true } },
    },
  })
}

export async function listExpenses({
  search,
  categoryId,
  from,
  to,
}: {
  search?: string
  categoryId?: string
  from?: Date
  to?: Date
} = {}) {
  const term = search?.trim()

  const expenses = await prisma.expense.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(from || to
        ? {
            expenseDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { payeeName: { contains: term, mode: 'insensitive' } },
              { billNumber: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      expenseDate: true,
      payeeName: true,
      description: true,
      amount: true,
      taxAmount: true,
      total: true,
      isInputCredit: true,
      paymentMode: true,
      billNumber: true,
      category: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
    },
  })

  return expenses.map((expense) => ({
    ...expense,
    amount: num(expense.amount),
    taxAmount: num(expense.taxAmount),
    total: num(expense.total),
  }))
}

export async function getExpense(id: string) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      order: { select: { id: true, number: true } },
      createdBy: { select: { name: true } },
    },
  })

  if (!expense) {
    return null
  }

  return {
    ...expense,
    amount: num(expense.amount),
    taxRatePercent: num(expense.taxRatePercent),
    taxAmount: num(expense.taxAmount),
    total: num(expense.total),
  }
}

export async function expenseSummary(from?: Date, to?: Date) {
  const rows = await prisma.expense.groupBy({
    by: ['categoryId'],
    where:
      from || to
        ? {
            expenseDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {},
    _sum: { total: true, taxAmount: true },
    _count: { _all: true },
  })

  const categories = await prisma.expenseCategory.findMany({
    select: { id: true, name: true },
  })
  const names = new Map(categories.map((row) => [row.id, row.name]))

  return rows
    .map((row) => ({
      categoryId: row.categoryId,
      name: row.categoryId
        ? (names.get(row.categoryId) ?? 'Unknown')
        : 'Uncategorised',
      count: row._count._all,
      total: row._sum.total ? num(row._sum.total) : 0,
      taxAmount: row._sum.taxAmount ? num(row._sum.taxAmount) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

export async function listNotes({
  search,
  kind,
  status,
}: {
  search?: string
  kind?: NoteKind
  status?: NoteStatus
} = {}) {
  const term = search?.trim()

  const notes = await prisma.creditDebitNote.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { vendorName: { contains: term, mode: 'insensitive' } },
              { customer: { name: { contains: term, mode: 'insensitive' } } },
              { invoice: { number: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      partyType: true,
      reason: true,
      noteDate: true,
      total: true,
      taxAmount: true,
      vendorName: true,
      customer: { select: { id: true, name: true } },
      invoice: { select: { id: true, number: true } },
    },
  })

  return notes.map((note) => ({
    ...note,
    total: num(note.total),
    taxAmount: num(note.taxAmount),
  }))
}

export async function getNote(id: string) {
  const note = await prisma.creditDebitNote.findUnique({
    where: { id },
    include: {
      customer: true,
      invoice: {
        select: { id: true, number: true, invoiceDate: true, total: true },
      },
      createdBy: { select: { name: true } },
      lines: { orderBy: { position: 'asc' } },
    },
  })

  if (!note) {
    return null
  }

  return {
    ...note,
    subtotal: num(note.subtotal),
    taxableAmount: num(note.taxableAmount),
    cgstAmount: num(note.cgstAmount),
    sgstAmount: num(note.sgstAmount),
    igstAmount: num(note.igstAmount),
    taxAmount: num(note.taxAmount),
    roundOff: num(note.roundOff),
    total: num(note.total),
    invoice: note.invoice
      ? { ...note.invoice, total: num(note.invoice.total) }
      : null,
    lines: note.lines.map((line) => ({
      ...line,
      quantity: num(line.quantity),
      rate: num(line.rate),
      taxRatePercent: num(line.taxRatePercent),
      amount: num(line.amount),
      cgstAmount: num(line.cgstAmount),
      sgstAmount: num(line.sgstAmount),
      igstAmount: num(line.igstAmount),
      lineTotal: num(line.lineTotal),
    })),
  }
}

export async function listInvoicesForPicker() {
  return prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    orderBy: { invoiceDate: 'desc' },
    take: 500,
    select: { id: true, number: true, customerId: true },
  })
}

export async function listCustomersForPicker() {
  return prisma.customer.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, state: true },
  })
}

export async function listOrdersForPicker() {
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' } },
    orderBy: { orderDate: 'desc' },
    take: 200,
    select: {
      id: true,
      number: true,
      customer: { select: { name: true } },
    },
  })

  return orders.map((order) => ({
    id: order.id,
    number: order.number,
    customerName: order.customer.name,
  }))
}

export type ExpenseListItem = Awaited<ReturnType<typeof listExpenses>>[number]
export type ExpenseDetail = NonNullable<Awaited<ReturnType<typeof getExpense>>>
export type NoteListItem = Awaited<ReturnType<typeof listNotes>>[number]
export type NoteDetail = NonNullable<Awaited<ReturnType<typeof getNote>>>
export type ExpenseCategoryListItem = Awaited<
  ReturnType<typeof listExpenseCategories>
>[number]
