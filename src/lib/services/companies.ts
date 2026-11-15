// Self-service company onboarding as a plain function, so the web action
// (src/lib/actions/companies.ts) and the mobile API can share the same rules.
// The callers decide who is acting and what happens afterwards (cookie,
// redirect, JSON).

import { prisma } from '@/lib/prisma'
import { createCompanyWithSeed, seedForIndustry } from '@/lib/company-setup'
import { isIndustryKey } from '@/lib/industry'
import { canCreateAnotherCompany } from '@/lib/team-rules'
import { companySettingSchema } from '@/lib/validation/company'

const ownCompanySchema = companySettingSchema.pick({
  companyName: true,
  gstin: true,
  phone: true,
  city: true,
})

export type OwnCompanyInput = {
  companyName: string
  gstin?: string
  phone?: string
  city?: string
  industry?: string
}

export type OwnCompanyResult =
  | { ok: true; id: string; companyName: string; industry: string }
  | {
      ok: false
      error: string
      kind: 'validation' | 'account-missing' | 'forbidden' | 'deactivated' | 'conflict'
      field?: string
    }

/**
 * Self-service onboarding: a signed-in person who belongs to no company creates
 * their own. They become its administrator (membership role only; their own
 * default role is untouched) and, if they were waiting for approval, are
 * activated. Accounts a platform administrator deactivated cannot use this to
 * come back. Never reads another company's data, and does not check names
 * against other companies (that would reveal who else exists).
 */
export async function createOwnCompanyFor(
  actor: { id: string; name: string },
  input: OwnCompanyInput,
): Promise<OwnCompanyResult> {
  const parsed = ownCompanySchema.safeParse({
    ...input,
    companyName: (input.companyName ?? '').trim().replace(/\s+/g, ' '),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]

    return { ok: false, kind: 'validation', error: issue.message, field: String(issue.path[0] ?? 'companyName') }
  }

  if (parsed.data.companyName.length < 2) {
    return { ok: false, kind: 'validation', error: 'Enter the company name', field: 'companyName' }
  }

  if (!isIndustryKey(input.industry)) {
    return { ok: false, kind: 'validation', error: 'Choose the industry your company is in', field: 'industry' }
  }

  const industry = input.industry

  const account = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { isActive: true, activatedAt: true, role: true },
  })

  if (!account) return { ok: false, kind: 'account-missing', error: 'Sign in again' }

  if (account.role === 'ADMIN') {
    return { ok: false, kind: 'forbidden', error: 'Use Companies under Administration to add a company' }
  }

  if (!account.isActive && account.activatedAt) {
    return {
      ok: false,
      kind: 'deactivated',
      error: 'Your account has been deactivated. Contact an administrator.',
    }
  }

  const [memberships, created] = await Promise.all([
    prisma.userCompany.count({ where: { userId: actor.id } }),
    prisma.companySetting.count({ where: { createdById: actor.id } }),
  ])

  if (memberships > 0) {
    return { ok: false, kind: 'conflict', error: 'You already belong to a company' }
  }

  if (!canCreateAnotherCompany(created)) {
    return { ok: false, kind: 'conflict', error: 'You have reached the limit of companies you can create' }
  }

  const company = await createCompanyWithSeed({
    details: { ...parsed.data, industry },
    seed: seedForIndustry(industry),
    actorId: actor.id,
    createdById: actor.id,
  })

  await prisma.userCompany.create({
    data: { userId: actor.id, companyId: company.id, role: 'ADMIN' },
  })

  if (!account.isActive) {
    await prisma.user.update({
      where: { id: actor.id },
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
        userId: actor.id,
        userName: actor.name,
      },
    })
  } catch {
    // The trail is a convenience.
  }

  return { ok: true, id: company.id, companyName: parsed.data.companyName, industry }
}
