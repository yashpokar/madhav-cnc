'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'
import { COMPANY_COOKIE, listAccessibleCompanies } from '@/lib/active-company'
import { getBaseUser, requireSuperAdmin, requireUser } from '@/lib/session'
import { createCompanyWithSeed, DEFAULT_SEED, readSeedFromActiveCompany } from '@/lib/company-setup'
import { canCreateAnotherCompany } from '@/lib/team-rules'
import { companySettingSchema } from '@/lib/validation/company'
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
  const company = await createCompanyWithSeed({
    details: { companyName },
    seed: await readSeedFromActiveCompany(),
    actorId: admin.id,
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

const ownCompanySchema = companySettingSchema.pick({
  companyName: true,
  gstin: true,
  phone: true,
  city: true,
})

/**
 * Self-service onboarding: a signed-in person who belongs to no company creates
 * their own. They become its administrator (membership role only; their own
 * default role is untouched) and, if they were waiting for approval, are
 * activated. Accounts a platform administrator deactivated cannot use this to
 * come back. Never reads another company's data, and does not check names
 * against other companies (that would reveal who else exists).
 */
export async function createOwnCompany(input: {
  companyName: string
  gstin?: string
  phone?: string
  city?: string
}): Promise<SimpleResult> {
  const base = await getBaseUser()

  if (!base) redirect('/sign-in')

  const parsed = ownCompanySchema.safeParse({
    ...input,
    companyName: (input.companyName ?? '').trim().replace(/\s+/g, ' '),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (parsed.data.companyName.length < 2) {
    return { ok: false, error: 'Enter the company name' }
  }

  const account = await prisma.user.findUnique({
    where: { id: base.id },
    select: { isActive: true, activatedAt: true, role: true },
  })

  if (!account) redirect('/sign-in')

  if (account.role === 'ADMIN') {
    return { ok: false, error: 'Use Companies under Administration to add a company' }
  }

  if (!account.isActive && account.activatedAt) {
    return { ok: false, error: 'Your account has been deactivated. Contact an administrator.' }
  }

  const [memberships, created] = await Promise.all([
    prisma.userCompany.count({ where: { userId: base.id } }),
    prisma.companySetting.count({ where: { createdById: base.id } }),
  ])

  if (memberships > 0) {
    return { ok: false, error: 'You already belong to a company' }
  }

  if (!canCreateAnotherCompany(created)) {
    return { ok: false, error: 'You have reached the limit of companies you can create' }
  }

  const company = await createCompanyWithSeed({
    details: parsed.data,
    seed: DEFAULT_SEED,
    actorId: base.id,
    createdById: base.id,
  })

  await prisma.userCompany.create({
    data: { userId: base.id, companyId: company.id, role: 'ADMIN' },
  })

  if (!account.isActive) {
    await prisma.user.update({
      where: { id: base.id },
      data: { isActive: true, activatedAt: new Date() },
    })
  }

  try {
    // Written with the new company id: the request's active company is not set yet.
    await prisma.activityLog.create({
      data: {
        companyId: company.id,
        entityType: 'company',
        entityId: company.id,
        action: 'created',
        summary: `created ${parsed.data.companyName}`,
        userId: base.id,
        userName: base.name,
      },
    })
  } catch {
    // The trail is a convenience.
  }

  ;(await cookies()).set(COMPANY_COOKIE, company.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  redirect('/')
}
