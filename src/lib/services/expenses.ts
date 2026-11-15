// Expenses and expense categories, as plain functions that take the acting
// user (no session, cookies, redirect or revalidatePath) so the server actions
// and the mobile API run the very same code.
//
// Runs inside a company scope (web: active-company cookie; API: X-Company-Id):
// the scope layer filters every lookup and stamps every insert, so no
// companyId is accepted from callers. A category, order, vendor or payment
// mode of another company is "not found". Permissions are checked by the
// caller (web requireCapability / API capability).

import { prisma } from '@/lib/prisma'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { nextExpenseNumber } from '@/lib/codes'
import { round2 } from '@/lib/pricing'
import { resolveVendor } from '@/lib/vendors'
import {
  expenseCategorySchema,
  type ExpenseCategoryData,
  type ExpenseData,
  type ExpenseInput,
} from '@/lib/validation/accounting'
import type { Actor, ServiceResult } from '@/lib/services/money-shared'

export type { Actor, ServiceResult, ExpenseInput, ExpenseCategoryData }

/** Pure rule: GST on the amount, and what was paid in all. */
export function expenseAmounts(data: Pick<ExpenseData, 'amount' | 'taxRatePercent'>) {
  const taxAmount = round2(data.amount * (data.taxRatePercent / 100))

  return { taxAmount, total: round2(data.amount + taxAmount) }
}

/** The mode and its details, checked together; the failure reads as the form's error. */
async function resolveMode(input: ExpenseInput) {
  const method = await resolvePaymentMode(input.channelId)

  if (!method) {
    return {
      ok: false as const,
      error: 'Choose a payment mode',
      fieldErrors: { channelId: 'Choose a payment mode' } as Record<string, string>,
    }
  }

  const details = parsePaymentDetails(method.mode, input.paymentDetails, 'out')

  if (!details.ok) {
    return { ok: false as const, error: details.error, fieldErrors: details.fieldErrors }
  }

  return { ok: true as const, method, details }
}

/** The receipt photo must be an unused expense_receipt upload of this company. */
async function checkReceipt(receiptUploadId: string | null | undefined, expenseId?: string) {
  if (!receiptUploadId) return { ok: true as const }

  const upload = await prisma.upload.findFirst({
    where: { id: receiptUploadId, purpose: 'expense_receipt' },
    select: { id: true },
  })

  if (!upload) {
    return {
      ok: false as const,
      error: 'Receipt upload not found',
      fieldErrors: { receiptUploadId: 'Upload the receipt again' } as Record<string, string>,
    }
  }

  const taken = await prisma.expense.findFirst({
    where: { receiptUploadId, ...(expenseId ? { NOT: { id: expenseId } } : {}) },
    select: { number: true },
  })

  if (taken) {
    return {
      ok: false as const,
      error: `That receipt is already attached to ${taken.number}`,
      fieldErrors: { receiptUploadId: 'Already used' } as Record<string, string>,
    }
  }

  return { ok: true as const }
}

async function markReceiptLinked(receiptUploadId: string | null | undefined) {
  if (receiptUploadId) {
    await prisma.upload.updateMany({ where: { id: receiptUploadId }, data: { linkedAt: new Date() } })
  }
}

function expenseColumns(
  input: ExpenseInput,
  vendor: { id: string; name: string },
  mode: { method: NonNullable<Awaited<ReturnType<typeof resolvePaymentMode>>>; details: { reference: string | null; details: Parameters<typeof detailsColumn>[0] } },
) {
  return {
    categoryId: input.categoryId,
    expenseDate: input.expenseDate,
    payeeName: vendor.name,
    vendorId: vendor.id,
    description: input.description,
    amount: input.amount,
    taxRatePercent: input.taxRatePercent,
    isInputCredit: input.isInputCredit,
    vendorGstin: input.vendorGstin,
    billNumber: input.billNumber,
    paymentMode: mode.method.mode,
    channelId: mode.method.channelId,
    modeName: mode.method.modeName,
    reference: mode.details.reference,
    paymentDetails: detailsColumn(mode.details.details),
    notes: input.notes,
    orderId: input.orderId,
    ...(input.receiptUploadId !== undefined ? { receiptUploadId: input.receiptUploadId } : {}),
    ...expenseAmounts(input),
  }
}

export async function createExpense(
  actor: Actor,
  input: ExpenseInput,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const mode = await resolveMode(input)

  if (!mode.ok) return mode

  const receipt = await checkReceipt(input.receiptUploadId)

  if (!receipt.ok) return receipt

  const number = await nextExpenseNumber()
  const vendor = await resolveVendor(input.payeeName)

  const expense = await prisma.expense.create({
    data: {
      number,
      ...expenseColumns(input, vendor, mode),
      createdById: actor.userId,
    },
  })

  await markReceiptLinked(input.receiptUploadId)

  return { ok: true, message: `${expense.number} recorded`, id: expense.id, number: expense.number }
}

export async function updateExpense(
  _actor: Actor,
  id: string,
  input: ExpenseInput,
): Promise<ServiceResult<{ id: string }>> {
  // The record first: a stranger's id is "not found" whatever else is wrong with the request.
  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } })

  if (!existing) return { ok: false, error: 'Expense not found' }

  const mode = await resolveMode(input)

  if (!mode.ok) return mode

  const receipt = await checkReceipt(input.receiptUploadId, id)

  if (!receipt.ok) return receipt

  const vendor = await resolveVendor(input.payeeName)

  await prisma.expense.update({ where: { id }, data: expenseColumns(input, vendor, mode) })
  await markReceiptLinked(input.receiptUploadId)

  return { ok: true, message: 'Expense saved', id }
}

export async function deleteExpense(_actor: Actor, id: string): Promise<ServiceResult> {
  const expense = await prisma.expense.findUnique({ where: { id }, select: { number: true } })

  if (!expense) return { ok: false, error: 'Expense not found' }

  await prisma.expense.delete({ where: { id } })

  return { ok: true, message: `${expense.number} removed` }
}

const DUPLICATE_CATEGORY = {
  ok: false as const,
  error: 'That category already exists',
  fieldErrors: { name: 'Already in use' },
}

export async function createExpenseCategory(
  _actor: Actor,
  input: ExpenseCategoryData,
): Promise<ServiceResult<{ id: string }>> {
  const duplicate = await prisma.expenseCategory.findFirst({
    where: { name: input.name },
    select: { id: true },
  })

  if (duplicate) return DUPLICATE_CATEGORY

  const category = await prisma.expenseCategory.create({ data: input })

  return { ok: true, message: `${category.name} added`, id: category.id }
}

export async function updateExpenseCategory(
  _actor: Actor,
  id: string,
  input: ExpenseCategoryData,
): Promise<ServiceResult<{ id: string }>> {
  const duplicate = await prisma.expenseCategory.findFirst({
    where: { name: input.name, NOT: { id } },
    select: { id: true },
  })

  if (duplicate) return DUPLICATE_CATEGORY

  await prisma.expenseCategory.update({ where: { id }, data: input })

  return { ok: true, message: 'Category saved', id }
}

export async function deleteExpenseCategory(_actor: Actor, id: string): Promise<ServiceResult> {
  const category = await prisma.expenseCategory.findUnique({
    where: { id },
    select: { name: true, _count: { select: { expenses: true } } },
  })

  if (!category) return { ok: false, error: 'Category not found' }

  if (category._count.expenses > 0) {
    return {
      ok: false,
      error: `${category.name} is used by ${category._count.expenses} expense(s). Mark it inactive instead.`,
    }
  }

  await prisma.expenseCategory.delete({ where: { id } })

  return { ok: true, message: `${category.name} removed` }
}

/** Adds a category by name (or returns the one that already has that name, ignoring case). */
export async function quickCreateExpenseCategory(
  _actor: Actor,
  name: string,
): Promise<ServiceResult<{ category: { id: string; name: string }; created: boolean }>> {
  const parsed = expenseCategorySchema.safeParse({ name, sortOrder: 0, isActive: true })

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const existing = await prisma.expenseCategory.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (existing) return { ok: true, message: `${existing.name} selected`, category: existing, created: false }

  const category = await prisma.expenseCategory.create({
    data: parsed.data,
    select: { id: true, name: true },
  })

  return { ok: true, message: `${category.name} added`, category, created: true }
}
