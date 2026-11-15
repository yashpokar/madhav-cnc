// Balance adjustments and the cash/bank opening balances, as plain functions
// that take the acting user (no session, cookies or revalidatePath) so the
// server actions and the mobile API run the same code.
//
// Runs inside a company scope (web: active-company cookie; API: X-Company-Id):
// the scope layer filters and stamps every row, so no companyId is accepted
// from callers; a payment mode or customer of another company is "not found".
// The caller checks the permission (settings:update: these move balances
// without a source document). Activity is logged here so web and API both
// leave a trail.

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getActiveCompanyId } from '@/lib/active-company'
import { nextAdjustmentNumber } from '@/lib/codes'
import { isFarFuture, signedAmount } from '@/lib/adjustments-math'
import { ADJUSTMENT_REASON_LABELS } from '@/lib/labels'
import { adjustmentInputSchema, type AdjustmentInput } from '@/lib/validation/adjustments'
import { activityActor, type Actor, type ServiceResult } from '@/lib/services/money-shared'

export type { Actor, ServiceResult, AdjustmentInput }

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

/** Validates the dialog's input and derives the signed amount; the first problem comes back as the error. */
export function parseAdjustment(input: AdjustmentInput, now = new Date()) {
  const parsed = adjustmentInputSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Check the form' }
  }

  const adjustedOn = new Date(`${parsed.data.adjustedOn}T00:00:00Z`)

  if (Number.isNaN(adjustedOn.getTime()) || isFarFuture(adjustedOn, now)) {
    return { ok: false as const, error: 'Choose a date that is not far in the future' }
  }

  return {
    ok: true as const,
    data: parsed.data,
    adjustedOn,
    amount: signedAmount(parsed.data.direction, parsed.data.amount),
  }
}

export function describeAdjustment(kind: 'CHANNEL' | 'CUSTOMER', amount: number, name: string) {
  const money = inr.format(Math.abs(amount))

  return kind === 'CHANNEL'
    ? `${amount > 0 ? 'added' : 'removed'} ${money} ${amount > 0 ? 'to' : 'from'} ${name}`
    : `${amount > 0 ? 'raised' : 'lowered'} what ${name} owes by ${money}`
}

export async function createAdjustment(
  actor: Actor,
  input: AdjustmentInput,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const parsed = parseAdjustment(input)

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
      createdById: actor.userId,
      updatedById: actor.userId,
    },
    select: { id: true, number: true },
  })

  const summary = `recorded ${created.number} (${ADJUSTMENT_REASON_LABELS[data.reason]}): ${describeAdjustment(data.kind, amount, name)}`
  const who = await activityActor(actor)

  await logActivity({ entity: 'adjustment', id: created.id, action: 'created', summary, actor: who })

  if (customerId) {
    await logActivity({ entity: 'customer', id: customerId, action: 'adjusted', summary, actor: who })
  }

  return { ok: true, message: `${created.number} recorded`, id: created.id, number: created.number }
}

const existingSelect = {
  number: true,
  kind: true,
  amount: true,
  customerId: true,
  channel: { select: { name: true } },
  customer: { select: { name: true } },
} as const

/** Corrects the amount, date, reason or note. What was adjusted stays fixed. */
export async function updateAdjustment(
  actor: Actor,
  id: string,
  input: AdjustmentInput,
): Promise<ServiceResult> {
  const parsed = parseAdjustment(input)

  if (!parsed.ok) return parsed

  const existing = await prisma.balanceAdjustment.findUnique({
    where: { id },
    select: existingSelect,
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
      updatedById: actor.userId,
    },
  })

  const name = existing.channel?.name ?? existing.customer?.name ?? 'balance'
  const summary = `changed ${existing.number} from ${inr.format(existing.amount.toNumber())} to ${inr.format(amount)} (${describeAdjustment(existing.kind, amount, name)})`
  const who = await activityActor(actor)

  await logActivity({ entity: 'adjustment', id, action: 'updated', summary, actor: who })

  if (existing.customerId) {
    await logActivity({ entity: 'customer', id: existing.customerId, action: 'adjusted', summary, actor: who })
  }

  return { ok: true, message: `${existing.number} updated` }
}

/** Removing an adjustment puts the balance back exactly as it was before it. */
export async function deleteAdjustment(actor: Actor, id: string): Promise<ServiceResult> {
  const existing = await prisma.balanceAdjustment.findUnique({
    where: { id },
    select: existingSelect,
  })

  if (!existing) return { ok: false, error: 'Adjustment not found' }

  await prisma.balanceAdjustment.delete({ where: { id } })

  const name = existing.channel?.name ?? existing.customer?.name ?? 'balance'
  const summary = `deleted ${existing.number} (${describeAdjustment(existing.kind, existing.amount.toNumber(), name)}); the balance is back as it was`
  const who = await activityActor(actor)

  await logActivity({ entity: 'adjustment', id, action: 'deleted', summary, actor: who })

  if (existing.customerId) {
    await logActivity({ entity: 'customer', id: existing.customerId, action: 'adjusted', summary, actor: who })
  }

  return { ok: true, message: `${existing.number} deleted` }
}

// ---- Opening cash and bank balances -------------------------------------

const openingRowSchema = z.object({
  channelId: z.string().trim().min(1),
  /** Signed: a negative amount is an overdraft. Blank clears the opening balance. */
  amount: z.string().trim(),
  asOf: z.string().trim(),
})

export const openingBalancesSchema = z.array(openingRowSchema)

export type OpeningBalanceRow = z.input<typeof openingRowSchema>

const MAX_OPENING = 999_999_999

export type OpeningChange = { channelId: string; amount: number | null; asOf: Date | null }

/**
 * Pure rule: turns the submitted rows into changes. A blank amount clears the
 * entry; otherwise the amount must be a finite number (negative allowed) and
 * the date is required.
 */
export function planOpeningChanges(
  rows: OpeningBalanceRow[],
  names: Map<string, string>,
): { ok: true; changes: OpeningChange[] } | { ok: false; error: string } {
  const changes: OpeningChange[] = []

  for (const row of rows) {
    const name = names.get(row.channelId)

    if (!name) return { ok: false, error: 'One of the payment modes no longer exists' }

    if (row.amount === '') {
      changes.push({ channelId: row.channelId, amount: null, asOf: null })
      continue
    }

    const amount = Number(row.amount)

    if (!Number.isFinite(amount) || Math.abs(amount) > MAX_OPENING) {
      return { ok: false, error: `${name}: enter a valid amount (use a minus sign if it is negative)` }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.asOf)) {
      return { ok: false, error: `${name}: choose the date this balance is as of` }
    }

    changes.push({
      channelId: row.channelId,
      amount: Math.round(amount * 100) / 100,
      asOf: new Date(`${row.asOf}T00:00:00Z`),
    })
  }

  return { ok: true, changes }
}

/**
 * Saves the cash and bank balance each payment mode held when books were
 * opened here. The amount can be negative. Blank amount removes the entry.
 */
export async function saveOpeningBalances(
  actor: Actor,
  input: OpeningBalanceRow[],
): Promise<ServiceResult> {
  const parsed = openingBalancesSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Something was wrong with the form. Try again.' }
  }

  const channels = await prisma.paymentChannel.findMany({ select: { id: true, name: true } })
  const names = new Map(channels.map((channel) => [channel.id, channel.name]))
  const plan = planOpeningChanges(parsed.data, names)

  if (!plan.ok) return plan

  const existing = await prisma.channelOpeningBalance.findMany({
    select: { id: true, channelId: true, amount: true, asOf: true },
  })
  const byChannel = new Map(existing.map((row) => [row.channelId, row]))
  const summary: string[] = []

  for (const change of plan.changes) {
    const current = byChannel.get(change.channelId)
    const name = names.get(change.channelId) ?? 'mode'

    if (change.amount === null || change.asOf === null) {
      if (current) {
        await prisma.channelOpeningBalance.delete({ where: { id: current.id } })
        summary.push(`${name}: cleared`)
      }

      continue
    }

    if (current) {
      const same =
        current.amount.toNumber() === change.amount &&
        current.asOf.getTime() === change.asOf.getTime()

      if (same) continue

      await prisma.channelOpeningBalance.update({
        where: { id: current.id },
        data: { amount: change.amount, asOf: change.asOf },
      })
    } else {
      await prisma.channelOpeningBalance.create({
        data: { channelId: change.channelId, amount: change.amount, asOf: change.asOf },
      })
    }

    summary.push(`${name}: ${change.amount}`)
  }

  if (summary.length > 0) {
    await logActivity({
      entity: 'company',
      id: (await getActiveCompanyId()) ?? parsed.data[0]?.channelId ?? 'company',
      action: 'updated',
      summary: `set opening cash and bank balances (${summary.join(', ')})`,
      actor: await activityActor(actor),
    })
  }

  return {
    ok: true,
    message: summary.length > 0 ? 'Opening balances saved' : 'Nothing changed',
  }
}
