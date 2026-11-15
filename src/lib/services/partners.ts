// Partner (architect / carpenter) writes as plain functions. Runs inside a
// company scope: the web session's active-company cookie or the API's
// X-Company-Id header. The scope layer filters every query by that company and
// stamps new rows, so nothing here takes a companyId from a caller.
//
// Permission checks stay with the caller. Callers pass data already validated
// with partnerInputSchema (src/lib/validation/partners.ts), which accepts
// FormData strings and JSON values alike.

import { prisma } from '@/lib/prisma'
import { nextPartnerCode } from '@/lib/codes'
import { partnerInputSchema, type PartnerData } from '@/lib/validation/partners'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'
import type { PartnerType } from '@/generated/prisma/enums'

export type { PartnerData }

export type QuickPartnerInput = {
  type: PartnerType
  name: string
  phone: string
  firmName?: string
  city?: string
  pincode?: string
}

export type QuickPartner = {
  id: string
  code: string
  name: string
  firmName: string | null
  city: string | null
}

/** Pure: the refusal text when a partner is still referenced, else null. */
export function partnerReferenceError(
  name: string,
  counts: { customers: number; quotations: number; orders: number },
): string | null {
  const { customers, quotations, orders } = counts

  return customers + quotations + orders > 0
    ? `${name} is referenced by ${customers} customer(s), ${quotations} quotation(s) and ${orders} order(s). Mark the partner inactive instead.`
    : null
}

export async function createPartner(
  actor: Actor,
  data: PartnerData,
): Promise<{ ok: true; id: string; code: string; name: string } | Failure> {
  const code = await nextPartnerCode(data.type as PartnerType)

  const partner = await prisma.partner.create({
    data: { ...data, code, createdById: actor.id, updatedById: actor.id },
  })

  return { ok: true, id: partner.id, code: partner.code, name: partner.name }
}

/** The partner's type is fixed once created, whatever the input says. */
export async function updatePartner(
  actor: Actor,
  id: string,
  data: PartnerData,
): Promise<{ ok: true; id: string; name: string } | Failure> {
  const existing = await prisma.partner.findUnique({ where: { id } })

  if (!existing) {
    return fail('Record not found', 'NOT_FOUND')
  }

  const partner = await prisma.partner.update({
    where: { id },
    data: { ...data, type: existing.type, updatedById: actor.id },
  })

  return { ok: true, id: partner.id, name: partner.name }
}

export async function setPartnerActive(
  actor: Actor,
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | Failure> {
  const existing = await prisma.partner.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return fail('Partner not found', 'NOT_FOUND')
  }

  await prisma.partner.update({
    where: { id },
    data: { isActive, updatedById: actor.id },
  })

  return { ok: true }
}

/** Creates a partner from the essentials, from inside another form. */
export async function quickCreatePartner(
  actor: Actor,
  input: QuickPartnerInput,
): Promise<{ ok: true; partner: QuickPartner } | Failure> {
  const parsed = partnerInputSchema.safeParse({
    type: input.type,
    name: input.name,
    phone: input.phone,
    firmName: input.firmName ?? '',
    city: input.city ?? '',
    pincode: input.pincode ?? '',
    isActive: true,
  })

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const code = await nextPartnerCode(parsed.data.type as PartnerType)

  const partner = await prisma.partner.create({
    data: { ...parsed.data, code, createdById: actor.id, updatedById: actor.id },
    select: { id: true, code: true, name: true, firmName: true, city: true },
  })

  return { ok: true, partner }
}

/** Refuses while customers, quotations or orders still point at the partner. */
export async function deletePartner(
  id: string,
): Promise<{ ok: true; message: string } | Failure> {
  const partner = await prisma.partner.findUnique({
    where: { id },
    select: { name: true },
  })

  if (!partner) {
    return fail('Partner not found', 'NOT_FOUND')
  }

  const [customers, quotations, orders] = await Promise.all([
    prisma.customer.count({
      where: { OR: [{ preferredArchitectId: id }, { preferredCarpenterId: id }] },
    }),
    prisma.quotation.count({
      where: { OR: [{ architectId: id }, { carpenterId: id }] },
    }),
    prisma.order.count({
      where: { OR: [{ architectId: id }, { carpenterId: id }] },
    }),
  ])

  const refusal = partnerReferenceError(partner.name, { customers, quotations, orders })

  if (refusal) {
    return fail(refusal)
  }

  await prisma.partner.delete({ where: { id } })

  return { ok: true, message: `${partner.name} deleted` }
}
