'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { PaymentMode } from '@/generated/prisma/enums'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const detailSchema = z.object({
  label: z.string().trim().max(60, 'Keep each label under 60 characters'),
  value: z.string().trim().max(300, 'Keep each value under 300 characters'),
})

const modeSchema = z.object({
  name: z.string().trim().min(1, 'Give the mode a name').max(60, 'Keep the name under 60 characters'),
  kind: z.enum(PaymentMode),
  /** Anything worth showing with the mode: bank, account number, IFSC, UPI ID... */
  details: z
    .array(detailSchema)
    .max(20, 'Add up to 20 details')
    .default([])
    .transform((rows) => rows.filter((row) => row.label || row.value)),
  showOnDocuments: z.boolean().default(false),
})

type ModeInput = {
  name: string
  kind: string
  details?: { label: string; value: string }[]
  showOnDocuments?: boolean
}

function refresh() {
  revalidatePath('/settings/payment-modes')
  revalidatePath('/payments')
  revalidatePath('/expenses')
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

/** Adds a payment mode at the end of the list. */
export async function addPaymentMode(input: ModeInput): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const parsed = modeSchema.safeParse(input)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (await nameTaken(parsed.data.name)) {
    return { ok: false, error: 'There is already a mode with that name' }
  }

  const last = await prisma.paymentChannel.aggregate({ _max: { sortOrder: true } })

  const created = await prisma.paymentChannel.create({
    data: {
      name: parsed.data.name,
      mode: parsed.data.kind,
      details: parsed.data.details,
      showOnDocuments: parsed.data.showOnDocuments,
      sortOrder: (last._max.sortOrder ?? 0) + 10,
    },
    select: { id: true },
  })

  refresh()

  return { ok: true, message: `${parsed.data.name} added`, id: created.id }
}

/**
 * Renames a mode or changes its kind. Past payments keep the name they were
 * recorded with; only new ones use the new name.
 */
export async function updatePaymentMode(
  id: string,
  input: ModeInput,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const parsed = modeSchema.safeParse(input)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  if (await nameTaken(parsed.data.name, id)) {
    return { ok: false, error: 'There is already a mode with that name' }
  }

  const existing = await prisma.paymentChannel.findUnique({ where: { id }, select: { id: true } })

  if (!existing) return { ok: false, error: 'That mode no longer exists' }

  await prisma.paymentChannel.update({
    where: { id },
    data: {
      name: parsed.data.name,
      mode: parsed.data.kind,
      details: parsed.data.details,
      showOnDocuments: parsed.data.showOnDocuments,
    },
  })
  refresh()

  return { ok: true, message: 'Saved' }
}

/** Hides a mode from the pickers, or brings it back. At least one must stay active. */
export async function setPaymentModeActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireCapability('settings:update')

  if (!active) {
    const others = await prisma.paymentChannel.count({ where: { isActive: true, id: { not: id } } })

    if (others === 0) {
      return { ok: false, error: 'Keep at least one payment mode active' }
    }
  }

  await prisma.paymentChannel.update({ where: { id }, data: { isActive: active } })
  refresh()

  return { ok: true, message: active ? 'Shown again' : 'Hidden from the pickers' }
}

/** Moves a mode one place up or down in the pickers. */
export async function movePaymentMode(id: string, direction: 'up' | 'down'): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const all = await prisma.paymentChannel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  })
  const index = all.findIndex((row) => row.id === id)
  const target = direction === 'up' ? index - 1 : index + 1

  if (index < 0 || target < 0 || target >= all.length) return { ok: true, message: 'Already there' }

  const order = all.map((row) => row.id)

  ;[order[index], order[target]] = [order[target], order[index]]

  await Promise.all(
    order.map((rowId, position) =>
      prisma.paymentChannel.update({ where: { id: rowId }, data: { sortOrder: (position + 1) * 10 } }),
    ),
  )
  refresh()

  return { ok: true, message: 'Moved' }
}

/** Deletes a mode that was never used. Used ones can only be hidden. */
export async function deletePaymentMode(id: string): Promise<SimpleResult> {
  await requireCapability('settings:update')

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
  refresh()

  return { ok: true, message: 'Deleted' }
}
