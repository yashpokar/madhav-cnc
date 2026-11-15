'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'
import { COMPANY_COOKIE, listAccessibleCompanies } from '@/lib/active-company'
import { requireSuperAdmin, requireUser } from '@/lib/session'
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
  const admin = await requireSuperAdmin()
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
  const admin = await requireSuperAdmin()

  const [person, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.companySetting.findUnique({ where: { id: companyId }, select: { companyName: true } }),
  ])

  if (!person || !company) {
    return { ok: false, error: 'Person or company not found' }
  }

  if (allowed) {
    // A new grant inherits the person's default role until one is chosen.
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId, companyId } },
      update: {},
      create: { userId, companyId },
    })
  } else {
    await prisma.userCompany.deleteMany({ where: { userId, companyId } })
  }

  await logActivity({
    entity: 'user',
    id: userId,
    action: allowed ? 'company-access-granted' : 'company-access-removed',
    summary: allowed
      ? `gave ${person.email} access to ${company.companyName}`
      : `removed ${person.email}'s access to ${company.companyName}`,
    actor: admin,
  })

  revalidatePath('/admin/companies')

  return { ok: true, message: allowed ? 'Access granted' : 'Access removed' }
}

/**
 * Sets the role a person has inside one company they can open. Null makes them
 * use their default role there. Platform super-admins only: a company
 * administrator cannot change roles, including their own.
 */
export async function setCompanyRole(
  userId: string,
  companyId: string,
  role: UserRole | null,
): Promise<SimpleResult> {
  const admin = await requireSuperAdmin()

  const parsed = z.enum(UserRole).nullable().safeParse(role)

  if (!parsed.success) {
    return { ok: false, error: 'Unknown role' }
  }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      role: true,
      user: { select: { email: true, role: true } },
      company: { select: { companyName: true } },
    },
  })

  if (!membership) {
    return { ok: false, error: 'Give this person access to the company first' }
  }

  if (membership.user.role === 'ADMIN') {
    return { ok: false, error: 'Administrators have full access to every company' }
  }

  if (membership.role === parsed.data) {
    return { ok: true, message: 'Role unchanged' }
  }

  await prisma.userCompany.update({
    where: { userId_companyId: { userId, companyId } },
    data: { role: parsed.data },
  })

  const label = parsed.data
    ? ROLE_LABELS[parsed.data]
    : `the default role (${ROLE_LABELS[membership.user.role]})`

  await logActivity({
    entity: 'user',
    id: userId,
    action: 'company-role-changed',
    summary: `set ${membership.user.email} to ${label} in ${membership.company.companyName}`,
    actor: admin,
  })

  revalidatePath('/admin/companies')

  return { ok: true, message: `Role set to ${label}` }
}
