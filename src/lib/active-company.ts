import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requestContext } from '@/lib/api/request-context'

/** The cookie that remembers which company a person is working in. */
export const COMPANY_COOKIE = 'company'

export type CompanyScope =
  /** Nobody is signed in, or there is no request (public links, seed scripts). */
  | { kind: 'open' }
  | { kind: 'company'; companyId: string }
  /** Signed in, but may not open any company: must see no company data at all. */
  | { kind: 'none' }

/**
 * Who the database layer should filter for. It fails closed: a signed-in
 * person with no company (a new sign-up, a deactivated account) is `none`,
 * never `open`, so they can not read every company's rows by accident.
 *
 * Loaded lazily by the database layer, so it must not import the database
 * client at the top: session -> auth -> prisma would be a cycle.
 */
export const getCompanyScope = cache(async (): Promise<CompanyScope> => {
  // Mobile API requests (see src/lib/api/handler.ts) run inside a request
  // context. The company they named in X-Company-Id is used INSTEAD of the
  // cookie, and is still checked against what the person may open. A request
  // that named no company sees no company data: it never falls back to the
  // first one.
  const api = requestContext.getStore()

  if (api) {
    if (!api.companyId) return { kind: 'none' }

    const { getBaseUser } = await import('@/lib/session')
    const person = await getBaseUser()

    if (!person || !person.isActive) return { kind: 'none' }

    const { prisma } = await import('@/lib/prisma')
    const allowed = await listAccessibleCompanies(person, prisma)

    return allowed.some((c) => c.id === api.companyId)
      ? { kind: 'company', companyId: api.companyId }
      : { kind: 'none' }
  }

  // Seed scripts have no request, so they name their company in the environment.
  if (process.env.SEED_COMPANY_ID) {
    return { kind: 'company', companyId: process.env.SEED_COMPANY_ID }
  }

  let chosen: string | undefined

  try {
    chosen = (await cookies()).get(COMPANY_COOKIE)?.value
  } catch {
    // Outside a request (seed script, auth callbacks).
    return { kind: 'open' }
  }

  const { getBaseUser } = await import('@/lib/session')
  const user = await getBaseUser()

  if (!user) return { kind: 'open' }

  if (!user.isActive) return { kind: 'none' }

  const { prisma } = await import('@/lib/prisma')
  const accessible = await listAccessibleCompanies(user, prisma)

  if (accessible.length === 0) return { kind: 'none' }

  const id = accessible.find((c) => c.id === chosen)?.id ?? accessible[0].id

  return { kind: 'company', companyId: id }
})

/**
 * The company this request works in: the one chosen in the switcher if the
 * signed-in person may open it, otherwise the first they may open. Null when
 * nobody is signed in (public quotation links), outside a request (seed
 * scripts), or the person has no company.
 */
export const getActiveCompanyId = cache(async (): Promise<string | null> => {
  const scope = await getCompanyScope()

  return scope.kind === 'company' ? scope.companyId : null
})

type Who = { id: string; isSuperAdmin: boolean }
type Db = {
  companySetting: {
    findMany: (args: unknown) => Promise<{ id: string; companyName: string }[]>
  }
}

/** Every company the person may open: all of them for a platform super-admin. */
export async function listAccessibleCompanies(user: Who, db: unknown) {
  const client = db as Db

  return client.companySetting.findMany({
    where: user.isSuperAdmin ? {} : { access: { some: { userId: user.id } } },
    select: { id: true, companyName: true },
    orderBy: { createdAt: 'asc' },
  })
}

/** For code that must be inside a company (numbering, settings). */
export async function requireCompanyId(): Promise<string> {
  const id = await getActiveCompanyId()

  if (!id) redirect('/pending')

  return id
}
