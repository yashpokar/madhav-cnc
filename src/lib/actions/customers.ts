'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextCustomerCode } from '@/lib/codes'
import { customerInputSchema } from '@/lib/validation/customers'
import type { FormState } from '@/lib/actions/partners'

export type { FormState }

function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[]
}) {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')

    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message
    }
  }

  return fieldErrors
}

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

  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)

  return {
    status: 'success',
    message: `${customer.name} updated`,
    id: customer.id,
  }
}
