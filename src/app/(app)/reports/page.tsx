import type { Metadata } from 'next'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { getReceivables } from '@/lib/queries/receivables'
import { expenseSummary } from '@/lib/queries/accounting'
import {
  ordersByStatus,
  quotationFunnel,
  salesByMonth,
  topCustomers,
} from '@/lib/queries/reports'
import { ORDER_STATUS_LABELS, QUOTATION_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Reports' }

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const compact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function Card({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <Subheading level={2}>{title}</Subheading>
        {action ?? (
          note ? (
            <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">
              {note}
            </span>
          ) : null
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Horizontal bar list: every bar carries its label and value as text. */
function Bars({
  rows,
  format = (value: number) => compact.format(value),
  tone = 'bg-zinc-900 dark:bg-zinc-200',
}: {
  rows: { label: string; value: number; hint?: string }[]
  format?: (value: number) => string
  tone?: string
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <ul className="grid grid-cols-1 gap-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm/5 sm:grid-cols-[9rem_1fr_auto]">
          <span className="truncate text-zinc-600 dark:text-zinc-300" title={row.label}>
            {row.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${tone}`}
              style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {format(row.value)}
            {row.hint ? (
              <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">{row.hint}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default async function ReportsPage() {
  const user = await requireCapability('invoice:read')
  const canExpenses = can(user.role, 'expense:read')
  const canPayments = can(user.role, 'payment:read')
  const canOrders = can(user.role, 'order:read')
  const canQuotes = can(user.role, 'quotation:read')

  const now = new Date()
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1))

  const [sales, customers, receivables, expenses, funnel, orders] = await Promise.all([
    salesByMonth(now),
    topCustomers(now),
    canPayments ? getReceivables(now) : null,
    canExpenses ? expenseSummary(yearAgo) : null,
    canQuotes ? quotationFunnel(now) : null,
    canOrders ? ordersByStatus() : null,
  ])

  const salesTotal = sales.reduce((sum, month) => sum + month.total, 0)
  const salesCount = sales.reduce((sum, month) => sum + month.count, 0)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Reports</Heading>
        <Text>Last 12 months unless stated. Figures count issued invoices only.</Text>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Sales by month"
          note={`${inr.format(salesTotal)} · ${salesCount} invoice${salesCount === 1 ? '' : 's'}`}
        >
          {salesCount === 0 ? (
            <EmptyState title="No issued invoices yet" description="Sales appear here once invoices are issued." />
          ) : (
            <Bars
              rows={sales.map((month) => ({
                label: month.label,
                value: month.total,
                hint: month.count > 0 ? `(${month.count})` : undefined,
              }))}
            />
          )}
        </Card>

        <Card title="Top customers" note="By invoiced value">
          {customers.length === 0 ? (
            <Text>No invoiced customers in this period.</Text>
          ) : (
            <Bars
              rows={customers.map((customer) => ({
                label: customer.name,
                value: customer.total,
                hint: `(${customer.count})`,
              }))}
            />
          )}
        </Card>

        {receivables ? (
          <Card
            title="Receivables ageing"
            action={
              <Link
                href="/payments"
                className="text-sm/5 font-medium underline decoration-zinc-950/30 dark:decoration-white/30"
              >
                Full detail →
              </Link>
            }
          >
            {receivables.invoices.length === 0 ? (
              <Text>Nothing outstanding. Every issued invoice is settled.</Text>
            ) : (
              <>
                <Bars
                  tone="bg-amber-500"
                  rows={receivables.aging.map((bucket) => ({
                    label: bucket.label,
                    value: bucket.amount,
                    hint: `(${bucket.count})`,
                  }))}
                />
                <p className="mt-3 text-sm/6 text-zinc-500 dark:text-zinc-400">
                  {inr.format(receivables.outstanding)} billed and unpaid, of which{' '}
                  {inr.format(receivables.overdue)} is overdue.
                </p>
              </>
            )}
          </Card>
        ) : null}

        {expenses ? (
          <Card title="Expenses by category" note={`${inr.format(expenses.reduce((s, r) => s + r.total, 0))} total`}>
            {expenses.length === 0 ? (
              <Text>No expenses recorded in this period.</Text>
            ) : (
              <Bars
                tone="bg-rose-500"
                rows={expenses.slice(0, 8).map((row) => ({
                  label: row.name,
                  value: row.total,
                  hint: `(${row.count})`,
                }))}
              />
            )}
          </Card>
        ) : null}

        {funnel ? (
          <Card title="Quotation conversion" note="Created in last 90 days">
            {funnel.total === 0 ? (
              <Text>No quotations created in the last 90 days.</Text>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl/9 font-semibold tabular-nums">{funnel.rate}%</span>
                  <span className="text-sm/6 text-zinc-500 dark:text-zinc-400">
                    {funnel.won} of {funnel.total} accepted or converted
                  </span>
                </div>
                <div className="mt-4">
                  <Bars
                    tone="bg-lime-600"
                    format={(value) => String(value)}
                    rows={funnel.byStatus.map((row) => ({
                      label: QUOTATION_STATUS_LABELS[row.status],
                      value: row.count,
                    }))}
                  />
                </div>
              </>
            )}
          </Card>
        ) : null}

        {orders ? (
          <Card title="Orders by status" note="All orders, today">
            {orders.length === 0 ? (
              <Text>No orders yet.</Text>
            ) : (
              <Bars
                tone="bg-sky-600"
                format={(value) => String(value)}
                rows={orders.map((row) => ({
                  label: ORDER_STATUS_LABELS[row.status],
                  value: row.count,
                }))}
              />
            )}
          </Card>
        ) : null}
      </div>
    </div>
  )
}
