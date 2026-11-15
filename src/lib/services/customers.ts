// Customer writes as plain functions. Runs inside a company scope: the web
// session's active-company cookie or the API's X-Company-Id header. The scope
// layer (company-scope.ts) filters every query by that company and stamps new
// rows, so nothing here takes a companyId from a caller.
//
// Permission checks stay with the caller (requireCapability on the web, the
// capability on apiRoute). Callers pass data already validated with
// customerInputSchema (src/lib/validation/customers.ts), which accepts both
// FormData strings and JSON values.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextCustomerCode } from '@/lib/codes'
import { customerInputSchema, type CustomerData } from '@/lib/validation/customers'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'

export type { CustomerData }

export type QuickCustomerInput = {
  name: string
  phone: string
  city?: string
  email?: string
}

export type QuickCustomer = {
  id: string
  code: string
  name: string
  phone: string
  city: string | null
  address: string | null
  pincode: string | null
  preferredArchitectId: string | null
  preferredCarpenterId: string | null
  paymentTermsDays: number | null
}

/** Pure: the message for a preferred architect / carpenter of the wrong kind. */
export function partnerTypeError(
  architectId: string | null,
  carpenterId: string | null,
  typeById: Map<string, string>,
): string | null {
  if (architectId && typeById.get(architectId) !== 'ARCHITECT') {
    return 'Preferred architect must be an architect'
  }

  if (carpenterId && typeById.get(carpenterId) !== 'CARPENTER') {
    return 'Preferred carpenter must be a carpenter'
  }

  return null
}

/** Pure: "2 orders, 1 invoice" style list of what a customer is tied to. */
export function linkedSummary(counts: [number, string][]): string[] {
  return counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`)
}

async function assertPartnerTypes(
  architectId: string | null,
  carpenterId: string | null,
) {
  const ids = [architectId, carpenterId].filter(Boolean) as string[]

  if (ids.length === 0) {
    return null
  }

  const partners = await prisma.partner.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true },
  })

  return partnerTypeError(
    architectId,
    carpenterId,
    new Map(partners.map((partner) => [partner.id, partner.type as string])),
  )
}

export async function createCustomer(
  actor: Actor,
  data: CustomerData,
): Promise<{ ok: true; id: string; code: string; name: string } | Failure> {
  const typeError = await assertPartnerTypes(
    data.preferredArchitectId,
    data.preferredCarpenterId,
  )

  if (typeError) {
    return fail(typeError, 'VALIDATION_FAILED')
  }

  const code = await nextCustomerCode()

  const customer = await prisma.customer.create({
    data: { ...data, code, createdById: actor.id, updatedById: actor.id },
  })

  await logActivity({
    entity: 'customer',
    id: customer.id,
    action: 'created',
    summary: 'created the customer',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, id: customer.id, code: customer.code, name: customer.name }
}

export async function updateCustomer(
  actor: Actor,
  id: string,
  data: CustomerData,
): Promise<{ ok: true; id: string; name: string } | Failure> {
  const typeError = await assertPartnerTypes(
    data.preferredArchitectId,
    data.preferredCarpenterId,
  )

  if (typeError) {
    return fail(typeError, 'VALIDATION_FAILED')
  }

  const existing = await prisma.customer.findUnique({ where: { id } })

  if (!existing) {
    return fail('Customer not found', 'NOT_FOUND')
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: { ...data, updatedById: actor.id },
  })

  await logActivity({
    entity: 'customer',
    id,
    action: 'updated',
    summary: 'edited the customer details',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, id: customer.id, name: customer.name }
}

/** Refuses while the customer has documents; they should go Inactive instead. */
export async function deleteCustomer(
  id: string,
): Promise<{ ok: true; message: string } | Failure> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { name: true, code: true },
  })

  if (!customer) {
    return fail('Customer not found', 'NOT_FOUND')
  }

  const [quotations, orders, invoices, payments, notes] = await Promise.all([
    prisma.quotation.count({ where: { customerId: id } }),
    prisma.order.count({ where: { customerId: id } }),
    prisma.invoice.count({ where: { customerId: id } }),
    prisma.payment.count({ where: { customerId: id } }),
    prisma.creditDebitNote.count({ where: { customerId: id } }),
  ])

  const linked = linkedSummary([
    [quotations, 'quotation'],
    [orders, 'order'],
    [invoices, 'invoice'],
    [payments, 'receipt'],
    [notes, 'note'],
  ])

  if (linked.length > 0) {
    return fail(
      `${customer.name} has ${linked.join(', ')}. Set the customer to Inactive instead to keep the history.`,
    )
  }

  await prisma.customer.delete({ where: { id } })

  return { ok: true, message: `${customer.name} deleted` }
}

/** Creates a customer from just a name and phone, from inside another form. */
export async function quickCreateCustomer(
  actor: Actor,
  input: QuickCustomerInput,
): Promise<{ ok: true; customer: QuickCustomer } | Failure> {
  const parsed = customerInputSchema.safeParse({
    name: input.name,
    phone: input.phone,
    city: input.city ?? '',
    email: input.email ?? '',
  })

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const duplicate = await prisma.customer.findFirst({
    where: { phone: parsed.data.phone },
    select: { id: true, name: true, code: true },
  })

  if (duplicate) {
    return fail(
      `${duplicate.name} (${duplicate.code}) already uses that phone number. Search for them instead.`,
      'CONFLICT',
      { existingId: duplicate.id },
    )
  }

  const code = await nextCustomerCode()

  const customer = await prisma.customer.create({
    data: { ...parsed.data, code, createdById: actor.id, updatedById: actor.id },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      address: true,
      pincode: true,
      preferredArchitectId: true,
      preferredCarpenterId: true,
      paymentTermsDays: true,
    },
  })

  await logActivity({
    entity: 'customer',
    id: customer.id,
    action: 'created',
    summary: 'created the customer from another form',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, customer }
}
