import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import {
  inr,
  Panel,
  Row,
  shortDate,
  StatTile,
} from '@/components/dashboard-parts'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import { can, ROLE_LABELS } from '@/lib/permissions'
import {
  getDispatchWatch,
  getMoneyWatch,
  getOrderWatch,
  getProductionWatch,
  getQuoteWatch,
} from '@/lib/queries/dashboard'
import { OverallStatement } from '@/components/overall-statement'
import { listReadyToInvoice } from '@/lib/queries/invoices'
import { getCustomerLedger, getReceivables } from '@/lib/queries/receivables'
import { countPendingUsers } from '@/lib/queries/users'
import { requireUser } from '@/lib/session'

function greeting() {
  const hour = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  ).getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'

  return 'Good evening'
}

function dueLabel(date: Date | null) {
  if (!date) return 'No due date'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round(
    (date.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86_400_000,
  )

  if (days < 0) return `${-days}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'

  return `Due ${shortDate.format(date)}`
}

function isLate(date: Date | null) {
  if (!date) return false
  const today = new Date()

  return (
    date.getTime() <
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  )
}

const OUTSTANDING_FILTERS = [
  { key: 'all', label: 'All due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'defaulted', label: 'Defaulted' },
] as const

export default async function DashboardPage({
  searchParams,
}: PageProps<'/'>) {
  const query = await searchParams
  const picked = Array.isArray(query.outstanding)
    ? query.outstanding[0]
    : query.outstanding
  const filter =
    OUTSTANDING_FILTERS.find((f) => f.key === picked)?.key ?? 'all'

  const user = await requireUser()
  const role = user.role

  const canQuotes = can(role, 'quotation:read')
  const canOrders = can(role, 'order:read')
  const canProduction = can(role, 'production:read')
  const canDispatch = can(role, 'dispatch:read')
  const canMoney = can(role, 'invoice:read')
  const isAdmin = can(role, 'user:update')

  const [quotes, orders, production, dispatch, money, receivables, ledger, pending, toInvoice] =
    await Promise.all([
      canQuotes ? getQuoteWatch() : null,
      canOrders ? getOrderWatch() : null,
      canProduction ? getProductionWatch(user.id) : null,
      canDispatch ? getDispatchWatch() : null,
      canMoney ? getMoneyWatch() : null,
      canMoney ? getReceivables() : null,
      canMoney && can(role, 'payment:read') ? getCustomerLedger() : null,
      isAdmin ? countPendingUsers() : 0,
      canMoney && can(role, 'invoice:create') ? listReadyToInvoice() : null,
    ])

  const quickActions = [
    { href: '/quotations/new', label: 'New quotation', cap: 'quotation:create' },
    { href: '/orders/new', label: 'New order', cap: 'order:create' },
    { href: '/customers/new', label: 'New customer', cap: 'customer:create' },
    { href: '/invoices/new', label: 'New invoice', cap: 'invoice:create' },
    { href: '/payments/new', label: 'Record receipt', cap: 'payment:create' },
    { href: '/dispatch/new', label: 'New challan', cap: 'dispatch:create' },
    { href: '/cashbook', label: 'Cash book', cap: 'expense:read' },
  ].filter((action) => can(role, action.cap as never))

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="grid gap-1">
          <Heading>
            {greeting()}, {user.name.split(' ')[0]}
          </Heading>
          <Text>
            Signed in as <Badge color="zinc">{ROLE_LABELS[role]}</Badge>
          </Text>
        </div>
        <p className="hidden text-xs/5 text-zinc-500 sm:block dark:text-zinc-400">
          Tip: press{' '}
          <kbd className="rounded bg-zinc-100 px-1 font-sans dark:bg-white/10">
            ⌘K
          </kbd>{' '}
          or{' '}
          <kbd className="rounded bg-zinc-100 px-1 font-sans dark:bg-white/10">
            Ctrl K
          </kbd>{' '}
          to search anything
        </p>
      </div>

      {isAdmin && pending > 0 ? (
        <div
          role="status"
          className="print:hidden flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm/6 text-amber-900 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20"
        >
          <span>
            {pending} account{pending === 1 ? '' : 's'} awaiting approval
          </span>
          <Link href="/admin/users" className="font-medium underline">
            Review
          </Link>
        </div>
      ) : null}

      {quickActions.length > 0 ? (
        <nav aria-label="Quick actions" className="flex flex-wrap gap-2 print:hidden">
          {quickActions.map((action, index) =>
            index === 0 ? (
              <Button key={action.href} href={action.href}>
                {action.label}
              </Button>
            ) : (
              <Button key={action.href} href={action.href} outline>
                {action.label}
              </Button>
            ),
          )}
        </nav>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
        {orders ? (
          <>
            <StatTile
              href="/orders"
              label="Open orders"
              value={orders.openCount}
              hint={`${orders.readyToDispatch} ready to dispatch`}
            />
            <StatTile
              href="/orders"
              label="Due this week"
              value={orders.dueThisWeek}
              hint={
                orders.overdue > 0
                  ? `${orders.overdue} overdue`
                  : 'Nothing overdue'
              }
              tone={orders.overdue > 0 ? 'warn' : 'default'}
            />
          </>
        ) : null}
        {quotes ? (
          <StatTile
            href="/quotations?tab=sent"
            label="Quotes awaiting reply"
            value={quotes.awaiting}
            hint={
              quotes.expiringSoon > 0
                ? `${quotes.expiringSoon} expire within 3 days`
                : `${quotes.drafts} in draft`
            }
            tone={quotes.expiringSoon > 0 ? 'warn' : 'default'}
          />
        ) : null}
        {production ? (
          <StatTile
            href="/production"
            label="In production"
            value={production.inProgress}
            hint={
              production.onHold > 0
                ? `${production.onHold} on hold`
                : 'Tasks running now'
            }
            tone={production.onHold > 0 ? 'warn' : 'default'}
          />
        ) : null}
        {receivables && money ? (
          <>
            <StatTile
              href="/payments"
              label="Outstanding"
              value={inr.format(receivables.outstanding)}
              hint={`${inr.format(receivables.overdue)} overdue`}
              tone={receivables.overdue > 0 ? 'warn' : 'default'}
            />
            <StatTile
              href="/payments"
              label="Collected this month"
              value={inr.format(money.collectedThisMonth)}
              tone="good"
            />
          </>
        ) : null}
        {dispatch ? (
          <StatTile
            href="/dispatch"
            label="Challans"
            value={dispatch.inTransit}
            hint={`in transit · ${dispatch.drafts} draft`}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 print:hidden">
        {production && production.mine.length > 0 ? (
          <Panel title="My tasks" href="/production" empty="">
            {production.mine.map((task) => (
              <Row
                key={task.id}
                href={`/orders/${task.order.id}`}
                title={`${task.order.number} · ${task.stage.name}`}
                subtitle={task.order.customer.name}
                trailing={dueLabel(task.order.dueDate)}
                trailingTone={isLate(task.order.dueDate) ? 'warn' : 'default'}
              />
            ))}
          </Panel>
        ) : null}

        {orders ? (
          <Panel
            title="Orders by due date"
            href="/orders"
            empty="No open orders. Nice and quiet."
          >
            {orders.list.map((order) => (
              <Row
                key={order.id}
                href={`/orders/${order.id}`}
                title={`${order.number} · ${order.customer.name}`}
                subtitle={ORDER_STATUS_LABELS[order.status]}
                trailing={dueLabel(order.dueDate)}
                trailingTone={isLate(order.dueDate) ? 'warn' : 'default'}
              />
            ))}
          </Panel>
        ) : null}

        {quotes ? (
          <Panel
            title="Quotes to follow up"
            href="/quotations"
            empty="No quotations are waiting on a customer."
          >
            {quotes.list.map((quotation) => (
              <Row
                key={quotation.id}
                href={`/quotations/${quotation.id}`}
                title={`${quotation.number} · ${quotation.customer.name}`}
                subtitle={inr.format(quotation.total)}
                trailing={
                  quotation.validUntil
                    ? `Valid to ${shortDate.format(quotation.validUntil)}`
                    : undefined
                }
              />
            ))}
          </Panel>
        ) : null}

        {toInvoice && toInvoice.count > 0 ? (
          <Panel
            title={`Ready to invoice (${toInvoice.count})`}
            href="/invoices/new"
            linkLabel="Pick an order"
            empty=""
          >
            {toInvoice.orders.map((order) => (
              <Row
                key={order.id}
                href={`/orders/${order.id}`}
                title={`${order.number} · ${order.customer.name}`}
                subtitle="Completed"
                trailing={inr.format(order.total)}
              />
            ))}
          </Panel>
        ) : null}

        {ledger ? (
          <section className="rounded-lg ring-1 ring-zinc-950/10 lg:col-span-2 dark:ring-white/10">
            <header className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3">
              <h2 className="text-sm/6 font-semibold text-zinc-950 dark:text-white">
                Outstanding by customer
              </h2>
              <div className="flex items-center gap-3">
                <nav aria-label="Filter outstanding" className="flex gap-1">
                  {OUTSTANDING_FILTERS.map((f) => (
                    <Link
                      key={f.key}
                      href={f.key === 'all' ? '/' : `/?outstanding=${f.key}`}
                      aria-current={filter === f.key ? 'true' : undefined}
                      className={
                        filter === f.key
                          ? 'rounded-md bg-zinc-950 px-2 py-0.5 text-xs/5 font-medium text-white dark:bg-white dark:text-zinc-950'
                          : 'rounded-md px-2 py-0.5 text-xs/5 font-medium text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-400 dark:hover:bg-white/10'
                      }
                    >
                      {f.label}
                    </Link>
                  ))}
                </nav>
                <Link
                  href="/payments"
                  className="text-xs/5 font-medium text-zinc-600 underline decoration-zinc-950/20 underline-offset-2 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                >
                  View all
                </Link>
              </div>
            </header>
            {(() => {
              const rows = ledger
                .filter((r) =>
                  filter === 'overdue'
                    ? r.overdue > 0
                    : filter === 'defaulted'
                      ? r.defaulted > 0
                      : r.due > 0,
                )
                .sort((a, b) =>
                  filter === 'defaulted'
                    ? b.defaulted - a.defaulted
                    : filter === 'overdue'
                      ? b.overdue - a.overdue
                      : b.due - a.due,
                )
              const shown = rows.slice(0, 8)

              return shown.length === 0 ? (
                <p className="px-3 py-4 text-sm/6 text-zinc-500 dark:text-zinc-400">
                  {filter === 'defaulted'
                    ? 'Nothing has been written off.'
                    : filter === 'overdue'
                      ? 'No customer is past a due date.'
                      : 'No customer owes anything.'}
                </p>
              ) : (
                <>
                  <ul className="mt-1 divide-y divide-zinc-950/5 pb-1 dark:divide-white/5">
                  {shown.map((r) => (
                    <Row
                      key={r.id}
                      href={`/customers/${r.id}/statement`}
                      title={r.name}
                      subtitle={
                        r.defaulted > 0
                          ? `${inr.format(r.defaulted)} written off`
                          : r.overdue > 0
                            ? `${inr.format(r.overdue)} overdue · ${r.oldestDays}d`
                            : 'Not yet due'
                      }
                      trailing={inr.format(
                        filter === 'defaulted'
                          ? r.defaulted
                          : filter === 'overdue'
                            ? r.overdue
                            : r.due,
                      )}
                      trailingTone={r.overdue > 0 ? 'warn' : 'default'}
                    />
                  ))}
                  </ul>
                  {rows.length > shown.length ? (
                    <p className="px-3 pb-2 text-xs/5 text-zinc-500 dark:text-zinc-400">
                      +{rows.length - shown.length} more customers
                    </p>
                  ) : null}
                </>
              )
            })()}
          </section>
        ) : null}

        {money ? (
          <Panel
            title="Overdue invoices"
            href="/invoices"
            empty="No overdue invoices."
          >
            {money.overdueList.map((invoice) => (
              <Row
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                title={`${invoice.number} · ${invoice.customer.name}`}
                subtitle={inr.format(invoice.total)}
                trailing={invoice.dueDate ? dueLabel(invoice.dueDate) : undefined}
                trailingTone="warn"
              />
            ))}
          </Panel>
        ) : null}
      </div>

      {canOrders ? (
        <OverallStatement params={query} showMoney={canMoney} />
      ) : null}
    </div>
  )
}
