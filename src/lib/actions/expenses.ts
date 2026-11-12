'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextExpenseNumber } from '@/lib/codes'
import { round2 } from '@/lib/pricing'
import {
  expenseCategorySchema,
  expenseInputSchema,
  cashCreditSchema,
} from '@/lib/validation/accounting'
import type { ExpenseData } from '@/lib/validation/accounting'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { FormState, SimpleResult }

function parse(formData: FormData) {
  return expenseInputSchema.safeParse({
    categoryId: formData.get('categoryId'),
    expenseDate: formData.get('expenseDate'),
    payeeName: formData.get('payeeName'),
    description: formData.get('description'),
    amount: formData.get('amount') || 0,
    taxRatePercent: formData.get('taxRatePercent') || 0,
    isInputCredit: formData.get('isInputCredit') === 'true',
    vendorGstin: formData.get('vendorGstin'),
    billNumber: formData.get('billNumber'),
    paymentMode: formData.get('paymentMode') ?? undefined,
    reference: formData.get('reference'),
    notes: formData.get('notes'),
    orderId: formData.get('orderId'),
  })
}

function amounts(data: ExpenseData) {
  const taxAmount = round2(data.amount * (data.taxRatePercent / 100))

  return { taxAmount, total: round2(data.amount + taxAmount) }
}

export async function createExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const number = await nextExpenseNumber()

  const expense = await prisma.expense.create({
    data: {
      number,
      categoryId: parsed.data.categoryId,
      expenseDate: parsed.data.expenseDate,
      payeeName: parsed.data.payeeName,
      description: parsed.data.description,
      amount: parsed.data.amount,
      taxRatePercent: parsed.data.taxRatePercent,
      isInputCredit: parsed.data.isInputCredit,
      vendorGstin: parsed.data.vendorGstin,
      billNumber: parsed.data.billNumber,
      paymentMode: parsed.data.paymentMode,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      orderId: parsed.data.orderId,
      ...amounts(parsed.data),
      createdById: user.id,
    },
  })

  revalidatePath('/expenses')
  redirect(`/expenses?created=${expense.number}`)
}

/** The light entry: vendor, amount, payment method (and a date, default today). */
export async function createLiteExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:create')

  const parsed = expenseInputSchema.safeParse({
    expenseDate: formData.get('expenseDate'),
    payeeName: formData.get('payeeName'),
    amount: formData.get('amount') || 0,
    paymentMode: formData.get('paymentMode') ?? undefined,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  // Match an existing vendor's spelling so "ABC traders" and "Abc Traders"
  // don't become two vendors.
  const known = await prisma.expense.findFirst({
    where: { payeeName: { equals: parsed.data.payeeName, mode: 'insensitive' } },
    select: { payeeName: true },
  })

  const expense = await prisma.expense.create({
    data: {
      number: await nextExpenseNumber(),
      expenseDate: parsed.data.expenseDate,
      payeeName: known?.payeeName ?? parsed.data.payeeName,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode,
      ...amounts(parsed.data),
      createdById: user.id,
    },
  })

  revalidatePath('/expenses')
  redirect(`/daybook?saved=${expense.number}`)
}

/**
 * One row typed straight into the day book. Saves without leaving the page, so
 * the next row can be typed straight away.
 */
export async function quickAddExpense(input: {
  payeeName: string
  amount: string
  mode: string
  date: string
}): Promise<SimpleResult> {
  const user = await requireCapability('expense:create')

  const parsed = expenseInputSchema.safeParse({
    expenseDate: input.date,
    payeeName: input.payeeName,
    amount: input.amount || 0,
    paymentMode: input.mode,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const known = await prisma.expense.findFirst({
    where: { payeeName: { equals: parsed.data.payeeName, mode: 'insensitive' } },
    select: { payeeName: true },
  })

  const expense = await prisma.expense.create({
    data: {
      number: await nextExpenseNumber(),
      expenseDate: parsed.data.expenseDate,
      payeeName: known?.payeeName ?? parsed.data.payeeName,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode,
      ...amounts(parsed.data),
      createdById: user.id,
    },
  })

  revalidatePath('/daybook')
  revalidatePath('/expenses')

  return { ok: true, message: `${expense.number} saved`, id: expense.id }
}

/** Ticks or unticks an entry in the day book's check column. */
export async function setEntryChecked(
  kind: 'expense' | 'credit' | 'receipt',
  id: string,
  checked: boolean,
): Promise<SimpleResult> {
  await requireCapability('expense:update')

  const data = { isChecked: checked }

  try {
    if (kind === 'expense') await prisma.expense.update({ where: { id }, data })
    else if (kind === 'credit') await prisma.cashCredit.update({ where: { id }, data })
    else await prisma.payment.update({ where: { id }, data })
  } catch {
    return { ok: false, error: 'Entry not found' }
  }

  revalidatePath('/daybook')

  return { ok: true, message: checked ? 'Checked' : 'Unchecked' }
}

/** The same for money received that is not a customer receipt. */
export async function quickAddCredit(input: {
  sourceName: string
  amount: string
  mode: string
  date: string
}): Promise<SimpleResult> {
  const user = await requireCapability('expense:create')

  const parsed = cashCreditSchema.safeParse({
    entryDate: input.date,
    sourceName: input.sourceName,
    amount: input.amount || 0,
    mode: input.mode,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const known = await prisma.cashCredit.findFirst({
    where: { sourceName: { equals: parsed.data.sourceName, mode: 'insensitive' } },
    select: { sourceName: true },
  })

  const credit = await prisma.cashCredit.create({
    data: {
      ...parsed.data,
      sourceName: known?.sourceName ?? parsed.data.sourceName,
      recordedById: user.id,
    },
  })

  revalidatePath('/daybook')

  return { ok: true, message: 'Saved', id: credit.id }
}

/** Money in that is not a customer receipt; shows on the cash book's CREDIT side. */
export async function createCashCredit(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:create')

  const parsed = cashCreditSchema.safeParse({
    entryDate: formData.get('entryDate'),
    sourceName: formData.get('sourceName'),
    amount: formData.get('amount') || 0,
    mode: formData.get('mode') ?? undefined,
    reference: formData.get('reference'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const known = await prisma.cashCredit.findFirst({
    where: { sourceName: { equals: parsed.data.sourceName, mode: 'insensitive' } },
    select: { sourceName: true },
  })

  await prisma.cashCredit.create({
    data: {
      ...parsed.data,
      sourceName: known?.sourceName ?? parsed.data.sourceName,
      recordedById: user.id,
    },
  })

  revalidatePath('/daybook')
  redirect('/daybook?savedCredit=1')
}

export async function deleteCashCredit(id: string): Promise<SimpleResult> {
  await requireCapability('expense:delete')

  const row = await prisma.cashCredit.findUnique({ where: { id }, select: { id: true } })

  if (!row) {
    return { ok: false, error: 'Entry not found' }
  }

  await prisma.cashCredit.delete({ where: { id } })
  revalidatePath('/daybook')

  return { ok: true, message: 'Credit entry deleted' }
}

export async function updateExpense(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.expense.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return { status: 'error', message: 'Expense not found' }
  }

  await prisma.expense.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      expenseDate: parsed.data.expenseDate,
      payeeName: parsed.data.payeeName,
      description: parsed.data.description,
      amount: parsed.data.amount,
      taxRatePercent: parsed.data.taxRatePercent,
      isInputCredit: parsed.data.isInputCredit,
      vendorGstin: parsed.data.vendorGstin,
      billNumber: parsed.data.billNumber,
      paymentMode: parsed.data.paymentMode,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      orderId: parsed.data.orderId,
      ...amounts(parsed.data),
    },
  })

  revalidatePath('/expenses')

  return { status: 'success', message: 'Expense saved', id }
}

export async function deleteExpense(id: string): Promise<SimpleResult> {
  await requireCapability('expense:delete')

  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { number: true },
  })

  if (!expense) {
    return { ok: false, error: 'Expense not found' }
  }

  await prisma.expense.delete({ where: { id } })

  revalidatePath('/expenses')

  return { ok: true, message: `${expense.number} removed` }
}

export async function createExpenseCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:create')

  const parsed = expenseCategorySchema.safeParse({
    name: formData.get('name'),
    sortOrder: formData.get('sortOrder') || 0,
    isActive: formData.get('isActive') === 'true',
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const duplicate = await prisma.expenseCategory.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  })

  if (duplicate) {
    return {
      status: 'error',
      message: 'That category already exists',
      fieldErrors: { name: 'Already in use' },
      values: rawValues(formData),
    }
  }

  const category = await prisma.expenseCategory.create({ data: parsed.data })

  revalidatePath('/expenses/categories')
  revalidatePath('/expenses')

  return {
    status: 'success',
    message: `${category.name} added`,
    id: category.id,
  }
}

export async function updateExpenseCategory(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:update')

  const parsed = expenseCategorySchema.safeParse({
    name: formData.get('name'),
    sortOrder: formData.get('sortOrder') || 0,
    isActive: formData.get('isActive') === 'true',
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const duplicate = await prisma.expenseCategory.findFirst({
    where: { name: parsed.data.name, NOT: { id } },
    select: { id: true },
  })

  if (duplicate) {
    return {
      status: 'error',
      message: 'That category already exists',
      fieldErrors: { name: 'Already in use' },
      values: rawValues(formData),
    }
  }

  await prisma.expenseCategory.update({ where: { id }, data: parsed.data })

  revalidatePath('/expenses/categories')
  revalidatePath('/expenses')

  return { status: 'success', message: 'Category saved', id }
}

export async function deleteExpenseCategory(
  id: string,
): Promise<SimpleResult> {
  await requireCapability('expense:delete')

  const category = await prisma.expenseCategory.findUnique({
    where: { id },
    select: { name: true, _count: { select: { expenses: true } } },
  })

  if (!category) {
    return { ok: false, error: 'Category not found' }
  }

  if (category._count.expenses > 0) {
    return {
      ok: false,
      error: `${category.name} is used by ${category._count.expenses} expense(s). Mark it inactive instead.`,
    }
  }

  await prisma.expenseCategory.delete({ where: { id } })

  revalidatePath('/expenses/categories')

  return { ok: true, message: `${category.name} removed` }
}

export type QuickCategoryResult =
  | { ok: true; category: { id: string; name: string } }
  | { ok: false; error: string }

/** Adds an expense category from inside the expense form. */
export async function quickCreateExpenseCategory(
  name: string,
): Promise<QuickCategoryResult> {
  await requireCapability('expense:create')

  const parsed = expenseCategorySchema.safeParse({
    name,
    sortOrder: 0,
    isActive: true,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const existing = await prisma.expenseCategory.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (existing) {
    return { ok: true, category: existing }
  }

  const category = await prisma.expenseCategory.create({
    data: parsed.data,
    select: { id: true, name: true },
  })

  revalidatePath('/expenses/categories')

  return { ok: true, category }
}
