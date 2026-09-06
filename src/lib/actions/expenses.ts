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
