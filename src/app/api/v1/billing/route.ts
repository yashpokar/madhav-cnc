import { apiRoute } from '@/lib/api/handler'
import { getBillingSnapshot } from '@/lib/services/billing'

// Read-only: the mobile apps show the plan and link to the web. Plans are not
// sold in the apps (store in-app purchase rules).
export const GET = apiRoute({ auth: 'company' }, async ({ companyId }) => {
  const { entitlements, decision, enforced } = await getBillingSnapshot(companyId)
  const base = (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '')

  return {
    plan: entitlements.plan,
    state: entitlements.state,
    entitlements: { invoiceQuota: entitlements.invoiceQuota, aiPreview: entitlements.aiPreview },
    usage: { invoicesIssued: decision.used, remaining: decision.remaining },
    renewsOn: entitlements.renewsOn ? entitlements.renewsOn.toISOString() : null,
    enforced,
    manageUrl: `${base}/settings/billing`,
  }
})
