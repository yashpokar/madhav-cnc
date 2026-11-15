// Payment modes (the business's own list: "HDFC NEFT", "Cash"...) and their
// structured receiving details, as plain functions with no session, cookies or
// revalidatePath, so the server actions and the mobile API run the same code.
//
// Runs inside a company scope (web: active-company cookie; API: X-Company-Id):
// the scope layer filters and stamps every row, so no companyId is accepted
// from callers and another company's modes are "not found". The caller checks
// the permission (settings:update); the state rules (name unique, at least one
// active mode, used modes cannot be deleted) are enforced here.

import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { parseReceivingDetails } from '@/lib/payment-methods'
import {
  paymentModeSchema,
  type PaymentModeData,
  type PaymentModeInput,
} from '@/lib/validation/payment-modes'
import type { ServiceResult } from '@/lib/services/money-shared'

export type { PaymentModeInput }

const GENERIC_BANK_TRANSFER =
  'Choose NEFT, RTGS, IMPS or net banking: they replace the generic bank transfer'

/** Checks the kind's fixed receiving fields; formats always, filled-in-ness once printed on documents. */
function checkAccount(data: PaymentModeData) {
  return parseReceivingDetails(data.kind, data.accountDetails, data.showOnDocuments)
}

async function nameTaken(name: string, exceptId?: string) {
  const found = await prisma.paymentChannel.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })

  return Boolean(found)
}

/** Pure rule: a legacy bank-transfer mode may stay, but nothing new can be made one. */
export function bankTransferAllowed(kind: string, existingKind: string | null) {
  return kind !== 'BANK_TRANSFER' || existingKind === 'BANK_TRANSFER'
}

/** Adds a payment mode at the end of the list. */
export async function addPaymentMode(input: PaymentModeInput): Promise<ServiceResult<{ id: string }>> {
  const parsed = paymentModeSchema.safeParse(input)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (await nameTaken(parsed.data.name)) {
    return { ok: false, error: 'There is already a mode with that name' }
  }

  if (!bankTransferAllowed(parsed.data.kind, null)) {
    return { ok: false, error: GENERIC_BANK_TRANSFER }
  }

  const account = checkAccount(parsed.data)

  if (!account.ok) return { ok: false, error: account.error }

  const last = await prisma.paymentChannel.aggregate({ _max: { sortOrder: true } })

  const created = await prisma.paymentChannel.create({
    data: {
      name: parsed.data.name,
      mode: parsed.data.kind,
      details: parsed.data.details,
      accountDetails: account.details ?? Prisma.DbNull,
      showOnDocuments: parsed.data.showOnDocuments,
      sortOrder: (last._max.sortOrder ?? 0) + 10,
    },
    select: { id: true },
  })

  return { ok: true, message: `${parsed.data.name} added`, id: created.id }
}

/**
 * Renames a mode or changes its kind. Past payments keep the name they were
 * recorded with; only new ones use the new name.
 */
export async function updatePaymentMode(
  id: string,
  input: PaymentModeInput,
): Promise<ServiceResult> {
  const parsed = paymentModeSchema.safeParse(input)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (await nameTaken(parsed.data.name, id)) {
    return { ok: false, error: 'There is already a mode with that name' }
  }

  const existing = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { id: true, mode: true },
  })

  if (!existing) return { ok: false, error: 'That mode no longer exists' }

  if (!bankTransferAllowed(parsed.data.kind, existing.mode)) {
    return { ok: false, error: GENERIC_BANK_TRANSFER }
  }

  const account = checkAccount(parsed.data)

  if (!account.ok) return { ok: false, error: account.error }

  await prisma.paymentChannel.update({
    where: { id },
    data: {
      name: parsed.data.name,
      mode: parsed.data.kind,
      details: parsed.data.details,
      accountDetails: account.details ?? Prisma.DbNull,
      showOnDocuments: parsed.data.showOnDocuments,
    },
  })

  return { ok: true, message: 'Saved' }
}

/** Hides a mode from the pickers, or brings it back. At least one must stay active. */
export async function setPaymentModeActive(id: string, active: boolean): Promise<ServiceResult> {
  if (!active) {
    const others = await prisma.paymentChannel.count({ where: { isActive: true, id: { not: id } } })

    if (others === 0) return { ok: false, error: 'Keep at least one payment mode active' }
  }

  await prisma.paymentChannel.update({ where: { id }, data: { isActive: active } })

  return { ok: true, message: active ? 'Shown again' : 'Hidden from the pickers' }
}

/** Pure rule: the order after moving one place up or down, or null when it is already at the edge. */
export function reorder(ids: string[], id: string, direction: 'up' | 'down'): string[] | null {
  const index = ids.indexOf(id)
  const target = direction === 'up' ? index - 1 : index + 1

  if (index < 0 || target < 0 || target >= ids.length) return null

  const order = [...ids]

  ;[order[index], order[target]] = [order[target], order[index]]

  return order
}

/** Moves a mode one place up or down in the pickers. */
export async function movePaymentMode(id: string, direction: 'up' | 'down'): Promise<ServiceResult> {
  const all = await prisma.paymentChannel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  })
  const order = reorder(all.map((row) => row.id), id, direction)

  if (!order) return { ok: true, message: 'Already there' }

  await Promise.all(
    order.map((rowId, position) =>
      prisma.paymentChannel.update({ where: { id: rowId }, data: { sortOrder: (position + 1) * 10 } }),
    ),
  )

  return { ok: true, message: 'Moved' }
}

/** Deletes a mode that was never used. Used ones can only be hidden. */
export async function deletePaymentMode(id: string): Promise<ServiceResult> {
  const row = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { _count: { select: { payments: true, expenses: true } } },
  })

  if (!row) return { ok: false, error: 'That mode no longer exists' }

  if (row._count.payments + row._count.expenses > 0) {
    return { ok: false, error: 'It has been used, so it cannot be deleted. Hide it instead.' }
  }

  const others = await prisma.paymentChannel.count({ where: { isActive: true, id: { not: id } } })

  if (others === 0) return { ok: false, error: 'Keep at least one payment mode' }

  await prisma.paymentChannel.delete({ where: { id } })

  return { ok: true, message: 'Deleted' }
}
