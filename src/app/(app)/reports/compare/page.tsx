import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { CompareExplorer } from '@/components/compare-explorer'
import { PERIOD_TYPES, type PeriodType } from '@/lib/compare-math'
import { can } from '@/lib/permissions'
import { getCompare } from '@/lib/queries/compare'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = { title: 'Compare periods' }

const TABS: Record<PeriodType, string> = { week: 'Weekly', month: 'Monthly', year: 'Yearly' }

export default async function ComparePage({ searchParams }: PageProps<'/reports/compare'>) {
  const user = await requireCapability('invoice:read')
  const params = await searchParams
  const asked = Array.isArray(params.period) ? params.period[0] : params.period
  const period = PERIOD_TYPES.find((type) => type === asked) ?? 'month'

  const data = await getCompare(period, {
    invoices: true,
    payments: can(user.role, 'payment:read'),
    expenses: can(user.role, 'expense:read'),
    purchases: can(user.role, 'purchase:read'),
    orders: can(user.role, 'order:read'),
    customers: can(user.role, 'customer:read'),
  })

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Link href="/reports" className="text-sm/5 text-zinc-500 hover:underline dark:text-zinc-400">
          ← Reports
        </Link>
        <Heading>Compare periods</Heading>
        <Text>
          This {period} so far against the same days of the {period} before and of last year. Weeks start on Monday;
          a year is the calendar year.
        </Text>
      </div>

      <nav aria-label="Period" className="flex h-10 w-fit items-center gap-1 rounded-lg bg-zinc-950/5 p-1 print:hidden dark:bg-white/5">
        {PERIOD_TYPES.map((type) => (
          <Link
            key={type}
            href={`/reports/compare?period=${type}`}
            aria-current={type === period ? 'true' : undefined}
            className={
              type === period
                ? 'flex h-8 items-center rounded-md bg-white px-3 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                : 'flex h-8 items-center rounded-md px-3 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
            }
          >
            {TABS[type]}
          </Link>
        ))}
      </nav>

      <CompareExplorer key={period} data={data} />

      <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
        Sales and invoices count issued invoices. Net cash is collections minus expenses. Receivables is billed to date
        minus received to date, so advances and opening balances can make it differ from the Payments screen.
      </p>
    </div>
  )
}
