import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/** The cookie that remembers which company a person is working in. */
export const COMPANY_COOKIE = 'company'

/**
 * The company this request works in: the one chosen in the switcher if the
 * signed-in person may open it, otherwise the first they may open. Null when
 * nobody is signed in (public quotation links) or outside a request (seed
 * scripts), in which case nothing is filtered by company.
 *
 * Loaded lazily by the database layer, so it must not import the database
 * client at the top: session -> auth -> prisma would be a cycle.
 */
export const getActiveCompanyId = cache(async (): Promise<string | null> => {
  // Seed scripts have no request, so they name their company in the environment.
  if (process.env.SEED_COMPANY_ID) return process.env.SEED_COMPANY_ID

  try {
    const { getCurrentUser } = await import('@/lib/session')
    const user = await getCurrentUser()

    if (!user || !user.isActive) return null

    const { prisma } = await import('@/lib/prisma')
    const accessible = await listAccessibleCompanies(user, prisma)

    if (accessible.length === 0) return null

    const chosen = (await cookies()).get(COMPANY_COOKIE)?.value

    return accessible.find((c) => c.id === chosen)?.id ?? accessible[0].id
  } catch {
    return null
  }
})

type Who = { id: string; role: string }
type Db = {
  companySetting: {
    findMany: (args: unknown) => Promise<{ id: string; companyName: string }[]>
  }
}

/** Every company the person may open: all of them for an administrator. */
export async function listAccessibleCompanies(user: Who, db: unknown) {
  const client = db as Db

  return client.companySetting.findMany({
    where: user.role === 'ADMIN' ? {} : { access: { some: { userId: user.id } } },
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
