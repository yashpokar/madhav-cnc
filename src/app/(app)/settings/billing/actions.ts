'use server'

import { revalidatePath } from 'next/cache'
import { requireCompanyId } from '@/lib/active-company'
import type { BillingPlan } from '@/lib/billing/plans'
import { createCheckoutOrder, setPlanManually } from '@/lib/services/billing'
import { requireCapability, requireSuperAdmin } from '@/lib/session'

export type CheckoutResult = { ok: true; redirectUrl: string } | { ok: false; error: string }

/** Starts a yearly purchase for the active company; the browser then goes to the payment page. */
export async function startCheckout(plan: string): Promise<CheckoutResult> {
  const user = await requireCapability('settings:update')
  const companyId = await requireCompanyId()
  const result = await createCheckoutOrder({ companyId, actor: { id: user.id, name: user.name }, plan })

  return result.ok ? { ok: true, redirectUrl: result.redirectUrl } : { ok: false, error: result.error }
}

/** A platform administrator sets a company's plan by hand, with a reason (logged). */
export async function setCompanyPlan(
  companyId: string,
  plan: BillingPlan,
  reason: string,
  expiresOn: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireSuperAdmin()
  const date = expiresOn ? new Date(`${expiresOn}T23:59:59+05:30`) : null

  if (date && Number.isNaN(date.getTime())) return { ok: false, error: 'Enter a valid end date' }

  const result = await setPlanManually({
    actor: { id: admin.id, name: admin.name },
    isSuperAdmin: admin.isSuperAdmin,
    companyId,
    plan,
    reason,
    expiresOn: date,
  })

  if (!result.ok) return result

  revalidatePath('/admin/billing')

  return { ok: true, message: 'Plan updated' }
}
