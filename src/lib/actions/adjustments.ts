'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextAdjustmentNumber } from '@/lib/codes'
import { requireCapability } from '@/lib/session'
import { isFarFuture, signedAmount } from '@/lib/adjustments-math'
import { ADJUSTMENT_REASON_LABELS } from '@/lib/labels'
import { adjustmentInputSchema, type AdjustmentInput } from '@/lib/validation/adjustments'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

// Creating, correcting and removing adjustments all need settings:update: they
// move money balances without a source document, so they sit with the other
// opening-balance powers rather than with day-to-day payment entry.
// Anyone with payment:read can see the list.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

function parse(input: AdjustmentInput) {
  const parsed = adjustmentInputSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Check the form' }
  }

  const adjustedOn = new Date(`${parsed.data.adjustedOn}T00:00:00Z`)

  if (Number.isNaN(adjustedOn.getTime()) || isFarFuture(adjustedOn, new Date())) {
    return { ok: false as const, error: 'Choose a date that is not far in the future' }
  }

  return {
    ok: true as const,
    data: parsed.data,
    adjustedOn,
    amount: signedAmount(parsed.data.direction, parsed.data.amount),
  }
}

function describe(kind: 'CHANNEL' | 'CUSTOMER', amount: number, name: string) {
  const money = inr.format(Math.abs(amount))

  return kind === 'CHANNEL'
    ? `${amount > 0 ? 'added' : 'removed'} ${money} ${amount > 0 ? 'to' : 'from'} ${name}`
    : `${amount > 0 ? 'raised' : 'lowered'} what ${name} owes by ${money}`
}

function refresh() {
  revalidatePath('/adjustments')
  revalidatePath('/reports/payment-methods')
  revalidatePath('/settings/opening-balances')
  revalidatePath('/customers')
  revalidatePath('/payments')
  revalidatePath('/')
}

export async function createAdjustment(input: AdjustmentInput): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const parsed = parse(input)

  if (!parsed.ok) return parsed

  const { data, adjustedOn, amount } = parsed
  let name: string
  let customerId: string | null = null
  let channelId: string | null = null

  // Both lookups are scoped to the active company, so a foreign id is "not found".
  if (data.kind === 'CHANNEL') {
    const channel = await prisma.paymentChannel.findUnique({
      where: { id: data.targetId },
      select: { id: true, name: true },
    })

    if (!channel) return { ok: false, error: 'That payment mode was not found' }

    name = channel.name
    channelId = channel.id
  } else {
    const customer = await prisma.customer.findUnique({
      where: { id: data.targetId },
      select: { id: true, name: true },
    })

    if (!customer) return { ok: false, error: 'That customer was not found' }

    name = customer.name
    customerId = customer.id
  }

  const created = await prisma.balanceAdjustment.create({
    data: {
      number: await nextAdjustmentNumber(),
      kind: data.kind,
      channelId,
      customerId,
      amount,
      adjustedOn,
      reason: data.reason,
      note: data.note,
      createdById: user.id,
      updatedById: user.id,
    },
    select: { id: true, number: true },
  })

  const summary = `recorded ${created.number} (${ADJUSTMENT_REASON_LABELS[data.reason]}): ${describe(data.kind, amount, name)}`
  const actor = { id: user.id, name: user.name }

  await logActivity({ entity: 'adjustment', id: created.id, action: 'created', summary, actor })

  if (customerId) {
    await logActivity({ entity: 'customer', id: customerId, action: 'adjusted', summary, actor })
  }

  refresh()

  return { ok: true, message: `${created.number} recorded`, id: created.id }
}

/** Corrects the amount, date, reason or note. What was adjusted stays fixed. */
export async function updateAdjustment(
  id: string,
  input: AdjustmentInput,
): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const parsed = parse(input)

  if (!parsed.ok) return parsed

  const existing = await prisma.balanceAdjustment.findUnique({
    where: { id },
    select: {
      number: true,
      kind: true,
      amount: true,
      customerId: true,
      channel: { select: { name: true } },
      customer: { select: { name: true } },
    },
  })

  if (!existing) return { ok: false, error: 'Adjustment not found' }

  const { data, adjustedOn, amount } = parsed

  await prisma.balanceAdjustment.update({
    where: { id },
    data: {
      amount,
      adjustedOn,
      reason: data.reason,
      note: data.note,
      updatedById: user.id,
    },
  })

  const name = existing.channel?.name ?? existing.customer?.name ?? 'balance'
  const summary = `changed ${existing.number} from ${inr.format(existing.amount.toNumber())} to ${inr.format(amount)} (${describe(existing.kind, amount, name)})`
  const actor = { id: user.id, name: user.name }

  await logActivity({ entity: 'adjustment', id, action: 'updated', summary, actor })

  if (existing.customerId) {
    await logActivity({ entity: 'customer', id: existing.customerId, action: 'adjusted', summary, actor })
  }

  refresh()

  return { ok: true, message: `${existing.number} updated` }
}

/** Removing an adjustment puts the balance back exactly as it was before it. */
export async function deleteAdjustment(id: string): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')

  const existing = await prisma.balanceAdjustment.findUnique({
    where: { id },
    select: {
      number: true,
      kind: true,
      amount: true,
      customerId: true,
      channel: { select: { name: true } },
      customer: { select: { name: true } },
    },
  })

  if (!existing) return { ok: false, error: 'Adjustment not found' }

  await prisma.balanceAdjustment.delete({ where: { id } })

  const name = existing.channel?.name ?? existing.customer?.name ?? 'balance'
  const summary = `deleted ${existing.number} (${describe(existing.kind, existing.amount.toNumber(), name)}); the balance is back as it was`
  const actor = { id: user.id, name: user.name }

  await logActivity({ entity: 'adjustment', id, action: 'deleted', summary, actor })

  if (existing.customerId) {
    await logActivity({ entity: 'customer', id: existing.customerId, action: 'adjusted', summary, actor })
  }

  refresh()

  return { ok: true, message: `${existing.number} deleted` }
}
