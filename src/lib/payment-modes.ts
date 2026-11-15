import { prisma } from '@/lib/prisma'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import type { PaymentMode } from '@/generated/prisma/enums'

/**
 * What a recorded payment or expense stores about how it was paid: the mode the
 * business chose ("HDFC NEFT"), the kind it belongs to (bank transfer, for
 * reports and filters) and the name as it was at the time.
 */
export type ResolvedPaymentMode = {
  channelId: string
  mode: PaymentMode
  modeName: string
}

/** Looks up a payment mode of the active company; null if it is not one. */
export async function resolvePaymentMode(
  channelId: string | null | undefined,
): Promise<ResolvedPaymentMode | null> {
  if (!channelId) return null

  const channel = await prisma.paymentChannel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, mode: true },
  })

  return channel ? { channelId: channel.id, mode: channel.mode, modeName: channel.name } : null
}

/** The words to show for a recorded payment or expense. */
export function modeText(row: { mode?: PaymentMode; paymentMode?: PaymentMode; modeName?: string | null }) {
  const kind = row.mode ?? row.paymentMode

  return row.modeName ?? (kind ? PAYMENT_MODE_LABELS[kind] : '')
}
