'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getActiveCompanyId } from '@/lib/active-company'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const rowSchema = z.object({
  channelId: z.string().trim().min(1),
  /** Signed: a negative amount is an overdraft. Blank clears the opening balance. */
  amount: z.string().trim(),
  asOf: z.string().trim(),
})

const MAX = 999_999_999

/**
 * Saves the cash and bank balance each payment mode held when books were
 * opened here. The amount can be negative. Blank amount removes the entry.
 */
export async function saveOpeningBalances(
  input: { channelId: string; amount: string; asOf: string }[],
): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const parsed = z.array(rowSchema).safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Something was wrong with the form. Try again.' }
  }

  const channels = await prisma.paymentChannel.findMany({
    select: { id: true, name: true },
  })
  const names = new Map(channels.map((channel) => [channel.id, channel.name]))

  const changes: { channelId: string; amount: number | null; asOf: Date | null }[] = []

  for (const row of parsed.data) {
    const name = names.get(row.channelId)

    if (!name) {
      return { ok: false, error: 'One of the payment modes no longer exists' }
    }

    if (row.amount === '') {
      changes.push({ channelId: row.channelId, amount: null, asOf: null })
      continue
    }

    const amount = Number(row.amount)

    if (!Number.isFinite(amount) || Math.abs(amount) > MAX) {
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

  const existing = await prisma.channelOpeningBalance.findMany({
    select: { id: true, channelId: true, amount: true, asOf: true },
  })
  const byChannel = new Map(existing.map((row) => [row.channelId, row]))
  const summary: string[] = []

  for (const change of changes) {
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
        data: {
          channelId: change.channelId,
          amount: change.amount,
          asOf: change.asOf,
        },
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
      actor: { id: user.id, name: user.name },
    })
  }

  revalidatePath('/settings/opening-balances')
  revalidatePath('/reports/payment-methods')

  return {
    ok: true,
    message: summary.length > 0 ? 'Opening balances saved' : 'Nothing changed',
  }
}
