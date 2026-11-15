'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { withAuditNote } from '@/lib/audit-trail/context'
import { requireCapability } from '@/lib/session'
import { expenseCategorySchema, expenseInputSchema } from '@/lib/validation/accounting'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import {
  createExpense as createExpenseService,
  createExpenseCategory as createCategoryService,
  deleteExpense as deleteExpenseService,
  deleteExpenseCategory as deleteCategoryService,
  quickCreateExpenseCategory as quickCreateCategoryService,
  updateExpense as updateExpenseService,
  updateExpenseCategory as updateCategoryService,
} from '@/lib/services/expenses'

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
    channelId: formData.get('channelId'),
    notes: formData.get('notes'),
    orderId: formData.get('orderId'),
  })
}

function parseCategory(formData: FormData) {
  return expenseCategorySchema.safeParse({
    name: formData.get('name'),
    sortOrder: formData.get('sortOrder') || 0,
    isActive: formData.get('isActive') === 'true',
  })
}

export async function createExpense(_previous: FormState, formData: FormData): Promise<FormState> {
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

  const result = await createExpenseService(
    { userId: user.id, name: user.name },
    { ...parsed.data, paymentDetails: formData.get('paymentDetails') },
  )

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  revalidatePath('/expenses')
  redirect(`/expenses?created=${result.number}`)
}

export async function updateExpense(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await updateExpenseService(
    { userId: user.id, name: user.name },
    id,
    { ...parsed.data, paymentDetails: formData.get('paymentDetails') },
  )

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  revalidatePath('/expenses')

  return { status: 'success', message: result.message, id }
}

export async function deleteExpense(id: string, reason?: string): Promise<SimpleResult> {
  const user = await requireCapability('expense:delete')
  const result = await withAuditNote({ reason }, () =>
    deleteExpenseService({ userId: user.id, name: user.name }, id),
  )

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/expenses')

  return { ok: true, message: result.message }
}

export async function createExpenseCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:create')
  const parsed = parseCategory(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await createCategoryService({ userId: user.id, name: user.name }, parsed.data)

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  revalidatePath('/expenses/categories')
  revalidatePath('/expenses')

  return { status: 'success', message: result.message, id: result.id }
}

export async function updateExpenseCategory(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('expense:update')
  const parsed = parseCategory(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await updateCategoryService({ userId: user.id, name: user.name }, id, parsed.data)

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  revalidatePath('/expenses/categories')
  revalidatePath('/expenses')

  return { status: 'success', message: result.message, id }
}

export async function deleteExpenseCategory(id: string): Promise<SimpleResult> {
  const user = await requireCapability('expense:delete')
  const result = await deleteCategoryService({ userId: user.id, name: user.name }, id)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/expenses/categories')

  return { ok: true, message: result.message }
}

export type QuickCategoryResult =
  { ok: true; category: { id: string; name: string } } | { ok: false; error: string }

/** Adds an expense category from inside the expense form. */
export async function quickCreateExpenseCategory(name: string): Promise<QuickCategoryResult> {
  const user = await requireCapability('expense:create')
  const result = await quickCreateCategoryService({ userId: user.id, name: user.name }, name)

  if (!result.ok) return { ok: false, error: result.error }

  // Only a genuinely new category changes the categories page.
  if (result.created) revalidatePath('/expenses/categories')

  return { ok: true, category: result.category }
}
