'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { vendorInputSchema } from '@/lib/validation/vendors'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'

export type { FormState }

function parse(formData: FormData) {
  return vendorInputSchema.safeParse({
    name: formData.get('name'),
    contactName: formData.get('contactName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    gstin: formData.get('gstin'),
    address: formData.get('address'),
    city: formData.get('city'),
    description: formData.get('description'),
    isActive: formData.get('isActive') === 'true',
  })
}

async function nameTaken(name: string, exceptId?: string) {
  const other = await prisma.vendor.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })

  return Boolean(other)
}

export async function createVendor(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  if (await nameTaken(parsed.data.name)) {
    return {
      status: 'error',
      message: 'A vendor with this name already exists',
      fieldErrors: { name: 'A vendor with this name already exists' },
      values: rawValues(formData),
    }
  }

  const vendor = await prisma.vendor.create({ data: parsed.data })

  revalidatePath('/vendors')
  redirect(`/vendors/${vendor.id}?created=1`)
}

export async function updateVendor(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  if (await nameTaken(parsed.data.name, id)) {
    return {
      status: 'error',
      message: 'A vendor with this name already exists',
      fieldErrors: { name: 'A vendor with this name already exists' },
      values: rawValues(formData),
    }
  }

  const existing = await prisma.vendor.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return { status: 'error', message: 'Vendor not found' }
  }

  await prisma.$transaction([
    prisma.vendor.update({ where: { id }, data: parsed.data }),
    // Keep the name printed on past expenses in step with the vendor.
    prisma.expense.updateMany({
      where: { vendorId: id },
      data: { payeeName: parsed.data.name },
    }),
  ])

  revalidatePath('/vendors')
  revalidatePath(`/vendors/${id}`)
  revalidatePath('/expenses')
  revalidatePath('/daybook')

  return { status: 'success', message: 'Vendor saved', id }
}

export async function deleteVendor(id: string) {
  await requireCapability('expense:delete')

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { name: true, _count: { select: { expenses: true } } },
  })

  if (!vendor) {
    return { ok: false as const, error: 'Vendor not found' }
  }

  if (vendor._count.expenses > 0) {
    return {
      ok: false as const,
      error: `${vendor.name} has ${vendor._count.expenses} expense(s). Mark the vendor inactive instead.`,
    }
  }

  await prisma.vendor.delete({ where: { id } })

  revalidatePath('/vendors')

  return { ok: true as const, message: `${vendor.name} deleted` }
}
