import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { CreateMenu } from '@/components/create-menu'
import {
  CARD,
  inr,
  MoneyBars,
  NowStrip,
  Panel,
  PeriodTile,
  Row,
  shortDate,
} from '@/components/dashboard-parts'
import { PayablesTile } from '@/components/payables-tile'
import { DashboardRangeBar } from '@/components/dashboard-range-bar'
import { LowStockTile } from '@/components/low-stock-tile'
import { readDashboardRange } from '@/lib/dashboard-range'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import { can } from '@/lib/permissions'
import {
  getDispatchWatch,
  getPeriodActivity,
  getOrderWatch,
  getProductionWatch,
  getQuoteWatch,
} from '@/lib/queries/dashboard'
import { listReadyToInvoice } from '@/lib/queries/invoices'
import { getCustomerLedger, getReceivables } from '@/lib/queries/receivables'
import { countPendingUsers } from '@/lib/queries/users'
import { getActiveIndustry } from '@/lib/queries/company'
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
  const industry = await getActiveIndustry()
  const { orders: ordersWord } = industry.terms
  const range = readDashboardRange(query)

  const canQuotes = can(role, 'quotation:read')
  const canOrders = can(role, 'order:read')
  const canProduction = can(role, 'production:read') && industry.modules.production
  const canDispatch = can(role, 'dispatch:read') && industry.modules.dispatch
  const canMoney = can(role, 'invoice:read')
  const canExpenses = can(role, 'expense:read')
  // Approving accounts is for platform super-admins only, not company admins.
  const isAdmin = user.isSuperAdmin

  const [
    quotes,
    orders,
    production,
    dispatch,
    receivables,
    ledger,
    pending,
    toInvoice,
    activity,
  ] = await Promise.all([
      canQuotes ? getQuoteWatch() : null,
      canOrders ? getOrderWatch() : null,
      canProduction ? getProductionWatch(user.id) : null,
      canDispatch ? getDispatchWatch() : null,
      canMoney ? getReceivables() : null,
      canMoney && can(role, 'payment:read') ? getCustomerLedger() : null,
      isAdmin ? countPendingUsers() : 0,
      canMoney && can(role, 'invoice:create') ? listReadyToInvoice() : null,
      canMoney || canExpenses || canOrders || canQuotes
        ? getPeriodActivity(range, {
            money: canMoney,
            expenses: canExpenses,
            orders: canOrders,
            quotes: canQuotes,
          })
        : null,
    ])

  // Carried along when the period changes, so the other filter is not lost.
  const keep: Record<string, string> = {}
  if (typeof query.outstanding === 'string') keep.outstanding = query.outstanding
  const span = `from=${range.fromIso}&to=${range.toIso}`
  const now = activity?.current
  const before = activity?.previous
  const attention = [
    receivables && receivables.overdue > 0
      ? {
          href: '/payments',
          text: `${inr.format(receivables.overdue)} is overdue from customers`,
          tone: 'bad' as const,
        }
      : null,
    orders && orders.overdue > 0
      ? { href: '/orders', text: `${orders.overdue} order${orders.overdue === 1 ? ' is' : 's are'} past the due date`, tone: 'bad' as const }
      : null,
    orders && orders.dueThisWeek > 0
      ? { href: '/orders', text: `${orders.dueThisWeek} order${orders.dueThisWeek === 1 ? '' : 's'} due in the next 7 days`, tone: 'warn' as const }
      : null,
    quotes && quotes.expiringSoon > 0
      ? { href: '/quotations?tab=sent', text: `${quotes.expiringSoon} quotation${quotes.expiringSoon === 1 ? '' : 's'} expire within 3 days`, tone: 'warn' as const }
      : null,
    toInvoice && toInvoice.count > 0
      ? { href: '/invoices/new', text: `${toInvoice.count} completed order${toInvoice.count === 1 ? '' : 's'} not yet invoiced`, tone: 'warn' as const }
      : null,
    orders && orders.readyToDispatch > 0
      ? { href: '/orders?tab=ready', text: `${orders.readyToDispatch} order${orders.readyToDispatch === 1 ? ' is' : 's are'} ready to dispatch`, tone: 'warn' as const }
      : null,
    production && production.onHold > 0
      ? { href: '/production', text: `${production.onHold} production task${production.onHold === 1 ? ' is' : 's are'} on hold`, tone: 'warn' as const }
      : null,
  ]
    .filter((item): item is NonNullable<typeof item> => item !== null)
    // Red first, then amber, keeping the order above within each tone.
    .sort((a, b) => Number(b.tone === 'bad') - Number(a.tone === 'bad'))

  const create = (
    [
      ['quotation', 'quotation:create'],
      ['order', 'order:create'],
      ['challan', 'dispatch:create'],
      ['invoice', 'invoice:create'],
      ['receipt', 'payment:create'],
      ['expense', 'expense:create'],
      ['customer', 'customer:create'],
    ] as const
  )
    .filter(([, cap]) => can(role, cap))
    .map(([key]) => key)

  const todayLong = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  const nowItems = [
    orders
      ? { href: '/orders', label: `Open ${ordersWord.toLowerCase()}`, value: orders.openCount, hint: `${orders.readyToDispatch} ready to dispatch` }
      : null,
    production
      ? {
          href: '/production',
          label: 'In production',
          value: production.inProgress,
          hint: production.onHold > 0 ? `${production.onHold} on hold` : 'tasks running',
          tone: production.onHold > 0 ? ('warn' as const) : undefined,
        }
      : null,
    quotes
      ? {
          href: '/quotations?tab=sent',
          label: 'Quotes awaiting reply',
          value: quotes.awaiting,
          hint: `${quotes.drafts} in draft`,
        }
      : null,
    dispatch
      ? { href: '/dispatch?tab=dispatched', label: 'Challans in transit', value: dispatch.inTransit, hint: `${dispatch.drafts} draft` }
      : null,
    ledger
      ? {
          href: '/?outstanding=defaulted',
          label: 'Not recoverable',
          value: inr.format(ledger.reduce((sum, r) => sum + r.defaulted, 0)),
          hint: `${ledger.filter((r) => r.defaulted > 0).length} customer(s)`,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  const showChart = Boolean(activity?.series) && range.days > 1

  const panels = [
    production && production.mine.length > 0 ? (
      <Panel key="mine" title="My tasks" href="/production" empty="">
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
    ) : null,
    orders ? (
      <Panel
        key="orders"
        title={`${ordersWord} by due date`}
        href="/orders"
        linkLabel={orders.openCount > orders.list.length ? `View all ${orders.openCount}` : 'View all'}
        empty={
          can(role, 'order:create')
            ? 'No open orders. Convert an accepted quotation, or create one from the + menu.'
            : 'No open orders. Nice and quiet.'
        }
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
    ) : null,
    quotes ? (
      <Panel
        key="quotes"
        title="Quotes to follow up"
        href="/quotations?tab=sent"
        empty={
          can(role, 'quotation:create')
            ? 'Nothing is waiting on a customer. Send a draft quotation to start the clock.'
            : 'No quotations are waiting on a customer.'
        }
        linkLabel={quotes.awaiting > quotes.list.length ? `View all ${quotes.awaiting}` : 'View all'}
      >
        {quotes.list.map((quotation) => (
          <Row
            key={quotation.id}
            href={`/quotations/${quotation.id}`}
            title={`${quotation.number} · ${quotation.customer.name}`}
            subtitle={inr.format(quotation.total)}
            trailing={
              quotation.validUntil ? `Valid to ${shortDate.format(quotation.validUntil)}` : undefined
            }
          />
        ))}
      </Panel>
    ) : null,
    toInvoice && toInvoice.count > 0 ? (
      <Panel
        key="bill"
        title={`Ready to invoice (${toInvoice.count})`}
        href="/invoices/new"
        linkLabel="Create invoice"
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
    ) : null,
  ].filter(Boolean)

  const filterHref = (key: string) =>
    `/?${new URLSearchParams({
      ...(range.key === 'custom'
        ? { range: 'custom', from: range.fromIso, to: range.toIso }
        : { range: range.key }),
      ...(key === 'all' ? {} : { outstanding: key }),
    })}`

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 print:hidden">
        <div className="grid gap-1">
          <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">{todayLong}</p>
          <Heading>
            {greeting()}, {user.name.split(' ')[0]}
          </Heading>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardRangeBar range={range} keep={keep} />
          <CreateMenu allowed={[...create]} />
        </div>
      </header>

      {isAdmin && pending > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm/6 text-amber-900 ring-1 ring-amber-950/10 print:hidden dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20"
        >
          <span>
            {pending} account{pending === 1 ? '' : 's'} awaiting approval
          </span>
          <Link href="/admin/users" className="font-medium underline">
            Review
          </Link>
        </div>
      ) : null}

      <section aria-label="Needs attention" className={`${CARD} print:hidden`}>
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-2.5 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-lime-500" />
            All clear. Nothing is late or waiting on you.
          </p>
        ) : (
          <>
          <h2 className="px-4 pt-4 text-sm/6 font-semibold">Needs attention</h2>
          <ul className="mt-2 divide-y divide-zinc-950/5 pb-2 dark:divide-white/5">
            {attention.map((item) => (
              <li key={item.text}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm/6 hover:bg-zinc-50 dark:hover:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-2 size-2 shrink-0 rounded-full ${
                      item.tone === 'bad'
                        ? 'bg-red-500'
                        : item.tone === 'warn'
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                    }`}
                  />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>

      <LowStockTile role={role} />

      {activity && now && before ? (
        <section aria-label={`Activity: ${range.label}`} className="grid gap-3 print:hidden">
          <h2 className="text-sm/6 font-semibold">
            {range.label}
            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
              compared with {range.compareLabel}
            </span>
          </h2>
          {canMoney ? (
            <div className="grid gap-3 md:grid-cols-2">
              <PeriodTile
                size="hero"
                href={`/payments?${span}`}
                label="Payments received"
                value={inr.format(now.received)}
                current={now.received}
                previous={before.received}
                versus={range.compareLabel}
                tone="good"
                note={`${now.receivedCount} payment${now.receivedCount === 1 ? '' : 's'}`}
              />
              {receivables ? (
                <PeriodTile
                  size="hero"
                  href="/payments"
                  label="Payment due"
                  value={inr.format(receivables.totalDue)}
                  tone={receivables.overdue > 0 ? 'bad' : 'default'}
                  note={
                    receivables.toBillDue > 0
                      ? `incl. ${inr.format(receivables.toBillDue)} not yet invoiced`
                      : 'all customers, today'
                  }
                  status={
                    receivables.overdue > 0
                      ? { text: `${inr.format(receivables.overdue)} overdue`, tone: 'bad' }
                      : { text: 'Nothing overdue', tone: 'good' }
                  }
                  share={
                    receivables.overdue > 0 && receivables.outstanding > 0
                      ? receivables.overdue / receivables.outstanding
                      : undefined
                  }
                />
              ) : null}
            </div>
          ) : null}
          {can(role, 'purchase:read') ? <PayablesTile /> : null}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-zinc-950/10 shadow-xs ring-1 ring-zinc-950/10 md:grid-flow-col md:auto-cols-fr dark:bg-white/10 dark:ring-white/10 [&>:last-child:nth-child(odd)]:col-span-2 md:[&>:last-child:nth-child(odd)]:col-span-1">
            {canExpenses ? (
              <PeriodTile
                href={`/expenses?${span}`}
                label="Money out"
                value={inr.format(now.spent)}
                current={now.spent}
                previous={before.spent}
                goodWhenUp={false}
                versus={range.compareLabel}
                note="expenses"
              />
            ) : null}
            {canMoney && canExpenses ? (
              <PeriodTile
                label="Net"
                value={`${now.received - now.spent < 0 ? '−' : ''}${inr.format(Math.abs(now.received - now.spent))}`}
                current={now.received - now.spent}
                previous={before.received - before.spent}
                versus={range.compareLabel}
                tone={now.received - now.spent < 0 ? 'bad' : 'default'}
                note="received minus spent"
              />
            ) : null}
            {canMoney ? (
              <PeriodTile
                href={`/invoices?tab=issued&${span}`}
                label="Billed"
                value={inr.format(now.billed)}
                current={now.billed}
                previous={before.billed}
                versus={range.compareLabel}
                note={`${now.billedCount} invoice${now.billedCount === 1 ? '' : 's'} issued${
                  receivables && receivables.toBillTotal > 0
                    ? ` · ${inr.format(receivables.toBillTotal)} delivered, not invoiced`
                    : ''
                }`}
              />
            ) : null}
            {canOrders ? (
              <PeriodTile
                href={`/orders?${span}`}
                label="New orders"
                value={String(now.orders)}
                current={now.orders}
                previous={before.orders}
                versus={range.compareLabel}
                note={`worth ${inr.format(now.ordersValue)}`}
              />
            ) : null}
            {canQuotes ? (
              <PeriodTile
                href={`/quotations?${span}`}
                label="Quotations sent"
                value={String(now.quotes)}
                current={now.quotes}
                previous={before.quotes}
                versus={range.compareLabel}
                note={`worth ${inr.format(now.quotesValue)}`}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {showChart && activity?.series ? (
        <div className="print:hidden">
          <section className={`${CARD} p-4`}>
            <h2 className="mb-3 text-sm/6 font-semibold">
              Money in and out{activity.series.weekly ? ', by week' : ', by day'}
            </h2>
            <MoneyBars buckets={activity.series.buckets} weekly={activity.series.weekly} />
          </section>
        </div>
      ) : null}

      <div className="print:hidden">
        <NowStrip items={nowItems} />
      </div>

      {panels.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2 print:hidden">
          {panels}
        </div>
      ) : null}

      {ledger ? (
        <section className={`${CARD} print:hidden`}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
            <h2 className="text-sm/6 font-semibold text-zinc-950 dark:text-white">
              Outstanding by customer
            </h2>
            <div className="flex items-center gap-3">
              <nav aria-label="Filter outstanding" className="flex gap-1 rounded-lg bg-zinc-950/5 p-0.5 dark:bg-white/5">
                {OUTSTANDING_FILTERS.map((f) => (
                  <Link
                    key={f.key}
                    href={filterHref(f.key)}
                    aria-current={filter === f.key ? 'true' : undefined}
                    className={
                      filter === f.key
                        ? 'rounded-md bg-white px-2.5 py-0.5 text-xs/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                        : 'rounded-md px-2.5 py-0.5 text-xs/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
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
                filter === 'overdue' ? r.overdue > 0 : filter === 'defaulted' ? r.defaulted > 0 : r.due > 0,
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
              <p className="px-4 pt-2 pb-5 text-sm/6 text-zinc-500 dark:text-zinc-400">
                {filter === 'defaulted'
                  ? 'Nothing has been written off.'
                  : filter === 'overdue'
                    ? 'No customer is past a due date.'
                    : 'No customer owes anything.'}
              </p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-zinc-950/5 pb-2 dark:divide-white/5">
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
                        filter === 'defaulted' ? r.defaulted : filter === 'overdue' ? r.overdue : r.due,
                      )}
                      trailingTone={r.overdue > 0 ? 'warn' : 'default'}
                    />
                  ))}
                </ul>
                {rows.length > shown.length ? (
                  <p className="px-4 pb-3 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    +{rows.length - shown.length} more customers
                  </p>
                ) : null}
              </>
            )
          })()}
        </section>
      ) : null}
    </div>
  )
}
