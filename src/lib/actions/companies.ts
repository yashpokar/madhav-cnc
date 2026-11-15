'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { COMPANY_COOKIE, listAccessibleCompanies } from '@/lib/active-company'
import { requireAdmin, requireUser } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

/** Switches the company the signed-in person is working in. */
export async function switchCompany(companyId: string): Promise<SimpleResult> {
  const user = await requireUser()
  const allowed = await listAccessibleCompanies(user, prisma)

  if (!allowed.some((company) => company.id === companyId)) {
    return { ok: false, error: 'You cannot open that company' }
  }

  ;(await cookies()).set(COMPANY_COOKIE, companyId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')

  return { ok: true, message: 'Switched' }
}

/**
 * Adds a company. It starts with the same production stages, expense
 * categories and payment modes as the company it is created from, so it can be
 * used straight away; customers, items and everything else start empty.
 */
export async function createCompany(name: string): Promise<SimpleResult> {
  const admin = await requireAdmin()
  const companyName = name.trim().replace(/\s+/g, ' ')

  if (companyName.length < 2) {
    return { ok: false, error: 'Enter the company name' }
  }

  if (companyName.length > 150) {
    return { ok: false, error: 'The name is too long' }
  }

  const exists = await prisma.companySetting.findFirst({
    where: { companyName: { equals: companyName, mode: 'insensitive' } },
    select: { id: true },
  })

  if (exists) {
    return { ok: false, error: 'A company with that name already exists' }
  }

  // Read from the company being worked in, before the new one exists.
  const [stages, categories, channels] = await Promise.all([
    prisma.productionStage.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.expenseCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.paymentChannel.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const company = await prisma.companySetting.create({
    data: { companyName, updatedById: admin.id },
    select: { id: true },
  })

  await prisma.productionStage.createMany({
    data: stages.map((row) => ({
      companyId: company.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      linkedStatus: row.linkedStatus,
    })),
  })
  await prisma.expenseCategory.createMany({
    data: categories.map((row) => ({
      companyId: company.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    })),
  })
  await prisma.paymentChannel.createMany({
    data: channels.map((row) => ({
      companyId: company.id,
      name: row.name,
      mode: row.mode,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    })),
  })

  revalidatePath('/admin/companies')

  return { ok: true, message: `${companyName} added`, id: company.id }
}

/** Gives one person access to a company, or takes it away. */
export async function setCompanyAccess(
  userId: string,
  companyId: string,
  allowed: boolean,
): Promise<SimpleResult> {
  await requireAdmin()

  if (allowed) {
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId, companyId } },
      update: {},
      create: { userId, companyId },
    })
  } else {
    await prisma.userCompany.deleteMany({ where: { userId, companyId } })
  }

  revalidatePath('/admin/companies')

  return { ok: true, message: allowed ? 'Access granted' : 'Access removed' }
}
