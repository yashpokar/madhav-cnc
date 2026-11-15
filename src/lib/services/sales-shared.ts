// Pieces shared by the quotation and order services. Every service in this
// folder runs inside a company scope (the web's active-company cookie or the
// API's X-Company-Id): the scope layer filters every query to that company and
// refuses writes that point at another company's rows, so nothing here takes a
// companyId from the caller.

import { prisma } from '@/lib/prisma'
import { applySizeRule, lineTotals } from '@/lib/pricing'
import type { QuotationLineData } from '@/lib/validation/quotations'

/** Who is acting. `name` is looked up when it is not passed. */
export type Actor = { userId: string; name?: string }

export type ServiceResult<T extends object = object> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string }

/** The `{ id, name }` pair activity entries are written with. */
export async function resolveActor(actor: Actor): Promise<{ id: string; name: string }> {
  if (actor.name) return { id: actor.userId, name: actor.name }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, name: true },
  })

  return { id: actor.userId, name: user?.name ?? 'Someone' }
}

/** The partner a document names must exist and be of the right kind. */
export async function checkPartners(ids: {
  architectId: string | null
  carpenterId: string | null
}): Promise<string | null> {
  const partnerIds = [ids.architectId, ids.carpenterId].filter(Boolean) as string[]

  if (partnerIds.length === 0) return null

  const partners = await prisma.partner.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, type: true },
  })
  const byId = new Map(partners.map((partner) => [partner.id, partner.type]))

  if (ids.architectId && byId.get(ids.architectId) !== 'ARCHITECT') {
    return 'Selected architect is not an architect'
  }

  if (ids.carpenterId && byId.get(ids.carpenterId) !== 'CARPENTER') {
    return 'Selected carpenter is not a carpenter'
  }

  return null
}

export async function checkCustomer(customerId: string): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  })

  return customer ? null : 'Selected customer no longer exists'
}

/** Size rule applied, then each line's money worked out, numbered from 1. */
export function buildLineRows(input: QuotationLineData[]) {
  const lines = input.map(applySizeRule)

  return {
    lines,
    rows: lines.map((line, index) => {
      const computed = lineTotals(line)

      return {
        position: index + 1,
        itemId: line.itemId,
        description: line.description,
        unit: line.unit,
        materialSupply: line.materialSupply,
        isFlatRate: line.isFlatRate,
        autoSize: line.autoSize,
        dimensionUnit: line.dimensionUnit,
        length: line.length,
        width: line.width,
        pieces: line.pieces,
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent,
        taxRatePercent: line.taxRatePercent,
        hsnCode: line.hsnCode,
        amount: computed.amount,
        taxAmount: computed.taxAmount,
        lineTotal: computed.lineTotal,
        notes: line.notes,
      }
    }),
  }
}
