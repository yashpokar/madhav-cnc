// Small pieces shared by the payments, expenses, payment-method and adjustment
// services. All of those run inside a company scope: the web sets it from the
// active-company cookie, the API from the X-Company-Id header, and the scope
// layer (company-scope.ts + tenant-rules.ts) then filters every query and
// stamps every insert. Services therefore never take a companyId as input.

import { prisma } from '@/lib/prisma'

/** The person acting. The name is only used for the activity trail; it is looked up when absent. */
export type Actor = { userId: string; name?: string }

export type ServiceResult<T extends object = object> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Resolves the { id, name } pair that logActivity wants. */
export async function activityActor(actor: Actor): Promise<{ id: string; name: string }> {
  if (actor.name) return { id: actor.userId, name: actor.name }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  })

  return { id: actor.userId, name: user?.name ?? 'Someone' }
}
