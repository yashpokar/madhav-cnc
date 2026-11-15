// Vendor writes as plain functions. Runs inside a company scope: the web
// session's active-company cookie or the API's X-Company-Id header. The scope
// layer filters every query by that company and stamps new rows, so nothing
// here takes a companyId from a caller. Name checks therefore only see this
// company's vendors.
//
// Permission checks stay with the caller (expense:* capabilities). Callers
// pass data already validated with vendorInputSchema
// (src/lib/validation/vendors.ts), which accepts FormData strings and JSON.

import { prisma } from '@/lib/prisma'
import { vendorInputSchema, type VendorData } from '@/lib/validation/vendors'
import { fail, type Failure } from '@/lib/services/people-shared'

export type { VendorData }

export type QuickVendorInput = {
  name: string
  contactName?: string
  phone?: string
  city?: string
  description?: string
  gstin?: string
}

export type QuickVendor = { id: string; name: string; detail: string }

const DUPLICATE = 'A vendor with this name already exists'

/** Pure: the one-line detail shown under a vendor in pickers. */
export function vendorDetail(vendor: {
  phone: string | null
  city: string | null
  description: string | null
}): string {
  return [vendor.phone, vendor.city].filter(Boolean).join(' · ') || vendor.description || ''
}

async function findByName(name: string, exceptId?: string) {
  const other = await prisma.vendor.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })

  return other?.id ?? null
}

/** Refuses a name already used by another vendor, returning that vendor's id. */
export async function createVendor(
  data: VendorData,
): Promise<{ ok: true; id: string } | Failure> {
  const taken = await findByName(data.name)

  if (taken) {
    return fail(DUPLICATE, 'CONFLICT', {
      fieldErrors: { name: DUPLICATE },
      existingId: taken,
    })
  }

  const vendor = await prisma.vendor.create({ data })

  return { ok: true, id: vendor.id }
}

/** Renames also rewrite the payee name printed on the vendor's past expenses. */
export async function updateVendor(
  id: string,
  data: VendorData,
): Promise<{ ok: true; id: string } | Failure> {
  const taken = await findByName(data.name, id)

  if (taken) {
    return fail(DUPLICATE, 'CONFLICT', {
      fieldErrors: { name: DUPLICATE },
      existingId: taken,
    })
  }

  const existing = await prisma.vendor.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return fail('Vendor not found', 'NOT_FOUND')
  }

  await prisma.$transaction([
    prisma.vendor.update({ where: { id }, data }),
    // Keep the name printed on past expenses in step with the vendor.
    prisma.expense.updateMany({
      where: { vendorId: id },
      data: { payeeName: data.name },
    }),
  ])

  return { ok: true, id }
}

/** Refuses while the vendor has expenses. */
export async function deleteVendor(
  id: string,
): Promise<{ ok: true; message: string } | Failure> {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { name: true, _count: { select: { expenses: true } } },
  })

  if (!vendor) {
    return fail('Vendor not found', 'NOT_FOUND')
  }

  if (vendor._count.expenses > 0) {
    return fail(
      `${vendor.name} has ${vendor._count.expenses} expense(s). Mark the vendor inactive instead.`,
    )
  }

  await prisma.vendor.delete({ where: { id } })

  return { ok: true, message: `${vendor.name} deleted` }
}

/** A vendor added on the spot from a picker; returns it so it can be selected. */
export async function quickCreateVendor(
  input: QuickVendorInput,
): Promise<{ ok: true; vendor: QuickVendor } | Failure> {
  const parsed = vendorInputSchema.safeParse({ ...input, isActive: true })

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const known = await prisma.vendor.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (known) {
    return fail(`${known.name} is already a vendor. Pick it from the list.`, 'CONFLICT', {
      existingId: known.id,
    })
  }

  const vendor = await prisma.vendor.create({
    data: parsed.data,
    select: { id: true, name: true, phone: true, city: true, description: true },
  })

  return {
    ok: true,
    vendor: { id: vendor.id, name: vendor.name, detail: vendorDetail(vendor) },
  }
}
