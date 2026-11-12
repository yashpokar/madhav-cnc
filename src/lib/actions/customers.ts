'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { requireCapability } from '@/lib/session'
import { nextCustomerCode } from '@/lib/codes'
import { customerInputSchema } from '@/lib/validation/customers'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'

export type { FormState }

function parse(formData: FormData) {
  return customerInputSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type') ?? undefined,
    status: formData.get('status') ?? undefined,
    phone: formData.get('phone'),
    altPhone: formData.get('altPhone'),
    email: formData.get('email'),
    address: formData.get('address'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    gstin: formData.get('gstin'),
    pan: formData.get('pan'),
    dateOfBirth: formData.get('dateOfBirth'),
    anniversaryDate: formData.get('anniversaryDate'),
    preferredArchitectId: formData.get('preferredArchitectId'),
    preferredCarpenterId: formData.get('preferredCarpenterId'),
    paymentTermsDays: formData.get('paymentTermsDays'),
    notes: formData.get('notes'),
  })
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

  const byId = new Map(partners.map((partner) => [partner.id, partner.type]))

  if (architectId && byId.get(architectId) !== 'ARCHITECT') {
    return 'Preferred architect must be an architect'
  }

  if (carpenterId && byId.get(carpenterId) !== 'CARPENTER') {
    return 'Preferred carpenter must be a carpenter'
  }

  return null
}

export async function createCustomer(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('customer:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const typeError = await assertPartnerTypes(
    parsed.data.preferredArchitectId,
    parsed.data.preferredCarpenterId,
  )

  if (typeError) {
    return { status: 'error', message: typeError }
  }

  const code = await nextCustomerCode()

  const customer = await prisma.customer.create({
    data: {
      ...parsed.data,
      code,
      createdById: user.id,
      updatedById: user.id,
    },
  })

  await logActivity({
    entity: 'customer',
    id: customer.id,
    action: 'created',
    summary: 'created the customer',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/customers')
  redirect(`/customers?created=${encodeURIComponent(customer.code)}`)
}

export async function updateCustomer(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('customer:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const typeError = await assertPartnerTypes(
    parsed.data.preferredArchitectId,
    parsed.data.preferredCarpenterId,
  )

  if (typeError) {
    return { status: 'error', message: typeError }
  }

  const existing = await prisma.customer.findUnique({ where: { id } })

  if (!existing) {
    return { status: 'error', message: 'Customer not found' }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: { ...parsed.data, updatedById: user.id },
  })

  await logActivity({
    entity: 'customer',
    id,
    action: 'updated',
    summary: 'edited the customer details',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)

  return {
    status: 'success',
    message: `${customer.name} updated`,
    id: customer.id,
  }
}

export async function deleteCustomer(id: string) {
  await requireCapability('customer:delete')

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { name: true, code: true },
  })

  if (!customer) {
    return { ok: false as const, error: 'Customer not found' }
  }

  const [quotations, orders, invoices, payments, notes] = await Promise.all([
    prisma.quotation.count({ where: { customerId: id } }),
    prisma.order.count({ where: { customerId: id } }),
    prisma.invoice.count({ where: { customerId: id } }),
    prisma.payment.count({ where: { customerId: id } }),
    prisma.creditDebitNote.count({ where: { customerId: id } }),
  ])

  const linked = [
    [quotations, 'quotation'],
    [orders, 'order'],
    [invoices, 'invoice'],
    [payments, 'receipt'],
    [notes, 'note'],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`)

  if (linked.length > 0) {
    return {
      ok: false as const,
      error: `${customer.name} has ${linked.join(', ')}. Set the customer to Inactive instead to keep the history.`,
    }
  }

  await prisma.customer.delete({ where: { id } })

  revalidatePath('/customers')

  return { ok: true as const, message: `${customer.name} deleted` }
}

export type QuickCustomerResult =
  | {
      ok: true
      customer: {
        id: string
        code: string
        name: string
        phone: string
        city: string | null
        address: string | null
        pincode: string | null
        preferredArchitectId: string | null
        preferredCarpenterId: string | null
      }
    }
  | { ok: false; error: string }

/** Creates a customer from just a name and phone, from inside another form. */
export async function quickCreateCustomer(input: {
  name: string
  phone: string
  city?: string
  email?: string
}): Promise<QuickCustomerResult> {
  const user = await requireCapability('customer:create')

  const parsed = customerInputSchema.safeParse({
    name: input.name,
    phone: input.phone,
    city: input.city ?? '',
    email: input.email ?? '',
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const duplicate = await prisma.customer.findFirst({
    where: { phone: parsed.data.phone },
    select: { name: true, code: true },
  })

  if (duplicate) {
    return {
      ok: false,
      error: `${duplicate.name} (${duplicate.code}) already uses that phone number. Search for them instead.`,
    }
  }

  const code = await nextCustomerCode()

  const customer = await prisma.customer.create({
    data: {
      ...parsed.data,
      code,
      createdById: user.id,
      updatedById: user.id,
    },
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
    },
  })

  await logActivity({
    entity: 'customer',
    id: customer.id,
    action: 'created',
    summary: 'created the customer from another form',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/customers')

  return { ok: true, customer }
}
