import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { getEntitlements } from '@/lib/billing/entitlements'
import type { BillingPlan } from '@/lib/billing/plans'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/session'
import { PlansManager } from './plans-manager'

export const metadata: Metadata = {
  title: 'Plans',
}

type Row = {
  id: string
  company_name: string
  plan: BillingPlan | null
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | null
  source: string | null
  period_end: Date | null
  issued: bigint
}

export default async function AdminBillingPage() {
  await requireSuperAdmin()

  // Raw SQL on purpose: the company filter on the client would show only the
  // company the administrator is currently working in, and this page lists all.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.id, c.company_name, s.plan, s.status, s.source, s.current_period_end AS period_end,
      (SELECT count(*) FROM invoices i
        WHERE i.company_id = c.id AND (i.issued_at IS NOT NULL OR i.status = 'ISSUED')) AS issued
    FROM company_settings c
    LEFT JOIN company_subscriptions s ON s.company_id = c.id
    ORDER BY c.company_name ASC`

  const now = new Date()

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-2">
        <Heading>Plans</Heading>
        <Text className="max-w-2xl">
          Every company with its plan and issued invoices. Setting a plan by hand is recorded in the activity log with
          your reason. A company with no plan yet is on Free.
        </Text>
      </div>

      <PlansManager
        companies={rows.map((row) => {
          const e = getEntitlements(
            row.plan && row.status
              ? { plan: row.plan, status: row.status, currentPeriodEnd: row.period_end }
              : null,
            now,
          )

          return {
            id: row.id,
            name: row.company_name,
            plan: e.plan,
            subscribedPlan: row.plan ?? 'FREE',
            state: e.state,
            source: row.source ?? 'SELF_SERVE',
            endsOn: row.period_end ? row.period_end.toISOString().slice(0, 10) : null,
            issued: Number(row.issued),
            quota: e.invoiceQuota,
          }
        })}
      />
    </div>
  )
}
