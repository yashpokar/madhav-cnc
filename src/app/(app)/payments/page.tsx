import { date as dateFormat, money as exact, moneyWhole as currency } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import { RowActions } from '@/components/row-actions'
import { deleteReceipt } from '@/lib/actions/payments'
import { DateRangeFilter } from '@/components/date-range-filter'
import { RangeSlider } from '@/components/range-slider'
import { amountCeiling, readDateRange, readListControls } from '@/lib/list-controls'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { FilterSelect } from '@/components/filter-select'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { PaymentMode } from '@/generated/prisma/enums'
import { paginate } from '@/lib/pagination'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import { ExportButton } from '@/components/export-button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { getCustomerLedger, getReceivables } from '@/lib/queries/receivables'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PAYMENT_MODE_LABELS, ORDER_STATUS_LABELS } from '@/lib/labels'
import { shortReference } from '@/lib/payment-methods'

export const metadata: Metadata = {
  title: 'Payments',
}

function Tile({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'plain' | 'alert' | 'bad'
}) {
  return (
    <div
      className={
        tone === 'alert'
          ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
          : tone === 'bad'
            ? 'rounded-lg bg-rose-50 p-4 ring-1 ring-rose-950/10 dark:bg-rose-400/10 dark:ring-rose-400/20'
            : 'rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10'
      }
    >
      <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl/8 font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export default async function PaymentsPage({
  searchParams,
}: PageProps<'/payments'>) {
  const user = await requireCapability('payment:read')
  const params = await searchParams
  const q = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase()
  const has = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((field) => field?.toLowerCase().includes(q))
  const modeParam = typeof params.mode === 'string' ? params.mode : undefined
  const mode = Object.values(PaymentMode).find((value) => value === modeParam)
  const age = params.age === 'overdue' || params.age === 'current' ? params.age : undefined
  const [data, ledger] = await Promise.all([getReceivables(new Date(), readDateRange(params)),
    getCustomerLedger(),
  ])
  const canSeeOrders = can(user.role, 'order:read')
  const canRecord = can(user.role, 'payment:create')

  const defaultedTotal = ledger.reduce((sum, row) => sum + row.defaulted, 0)
  const defaultedCount = ledger.filter((row) => row.defaulted > 0).length

  const { from, to } = readDateRange(params)
  const minPaid = readListControls(params).min
  const maxPaid = readListControls(params).max
  const receiptCeiling = amountCeiling(data.payments, (row) => row.amount)
  const receiptsFiltered =
    from !== undefined ||
    to !== undefined ||
    minPaid !== undefined ||
    maxPaid !== undefined ||
    mode !== undefined
  const receiptsMatching = data.payments.filter(
    (row) =>
      has(
        row.customer.name,
        row.number,
        row.reference,
        row.invoiceNumbers.join(' '),
        modeText(row),
      ) &&
      (!mode || row.mode === mode) &&
      (minPaid === undefined || row.amount >= minPaid) &&
      (maxPaid === undefined || row.amount <= maxPaid),
  )
  const appliedTo = (row: (typeof data.payments)[number]) =>
    row.isAdvance
      ? 'Order advance'
      : row.invoiceNumbers.length === 0 && row.openingApplied <= 0
        ? 'On account'
        : [
            ...row.invoiceNumbers,
            ...(row.openingApplied > 0 ? ['Opening balance'] : []),
          ].join(', ')
  const receipts = sortRows(receiptsMatching, params, {
    recv_number: (row) => row.number,
    recv_date: (row) => row.paidOn,
    recv_customer: (row) => row.customer.name,
    recv_applied: appliedTo,
    recv_mode: (row) => modeText(row),
    recv_reference: (row) => row.reference,
    recv_amount: (row) => row.amount,
  })
  const receiptsPaged = paginate(receipts, params, { pageKey: 'rp', sizeKey: 'rs' })

  const TABS = [
    { value: 'recover', label: 'To recover', count: data.invoices.length },
    { value: 'received', label: 'Received', count: undefined },
    ...(canSeeOrders ? [{ value: 'tobill', label: 'Yet to bill', count: data.toBill.length }] : []),
  ]
  const asked = typeof params.tab === 'string' ? params.tab : undefined
  const tab = TABS.some((t) => t.value === asked)
    ? asked
    : receiptsFiltered
      ? 'received'
      : 'recover'
  const tabHref = (value: string) => {
    const next = new URLSearchParams()
    if (value !== 'recover') next.set('tab', value)
    if (q) next.set('q', String(params.q))
    return next.toString() ? `/payments?${next}` : '/payments'
  }

  const clearFilters = (value: string) =>
    value === 'recover' ? '/payments' : `/payments?tab=${value}`
  // Column headings keep every filter but start again from the first page.
  const sortParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !['cp', 'ip', 'rp', 'bp'].includes(key)),
  )
  const sortKeep = (['sort', 'dir'] as const).flatMap((key) => {
    const value = params[key]

    return typeof value === 'string' ? [[key, value] as const] : []
  })
  const countLine = (shown: number, all: number, noun: string) => (
    <p className="mt-4 text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
      {shown} of {all} {noun}
      {all === 1 ? '' : 's'}
    </p>
  )

  const byCustomerRows = sortRows(
    data.byCustomer.filter((row) => has(row.name, row.phone)),
    params,
    {
      cust_name: (row) => row.name,
      cust_invoices: (row) => row.invoices,
      cust_due: (row) => row.due,
      cust_overdue: (row) => row.overdue,
      cust_onaccount: (row) => row.onAccount,
      cust_credit: (row) => row.credit,
      cust_net: (row) => row.net,
      cust_oldest: (row) => row.oldestDays,
    },
  )
  const openRows = sortRows(
    data.invoices.filter(
      (row) =>
        has(row.customer.name, row.number, row.order?.number) &&
        (age !== 'overdue' || row.overdueBy > 0) &&
        (age !== 'current' || row.overdueBy <= 0),
    ),
    params,
    {
      inv_number: (row) => row.number,
      inv_customer: (row) => row.customer.name,
      inv_duedate: (row) => row.dueDate ?? row.invoiceDate,
      inv_total: (row) => row.total,
      inv_paid: (row) => row.paid,
      inv_balance: (row) => row.due,
      inv_age: (row) => row.overdueBy,
    },
  )
  const toBillRows = sortRows(
    data.toBill.filter((row) =>
      has(row.number, row.customer.name, ORDER_STATUS_LABELS[row.status]),
    ),
    params,
    {
      bill_order: (row) => row.number,
      bill_customer: (row) => row.customer.name,
      bill_status: (row) => ORDER_STATUS_LABELS[row.status],
      bill_date: (row) => row.orderDate,
      bill_value: (row) => row.total,
      bill_waiting: (row) => row.waitingDays,
    },
  )
  const byCustomerPaged = paginate(byCustomerRows, params, { pageKey: 'cp', sizeKey: 'cs' })
  const openPaged = paginate(openRows, params, { pageKey: 'ip', sizeKey: 'is' })
  const toBillPaged = paginate(toBillRows, params, { pageKey: 'bp', sizeKey: 'bs' })

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Payments</Heading>
          <Text>What is still to be recovered, and what has come in.</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField placeholder="Search customer, invoice, receipt…" />
          <ExportButton kind="payments" />
          {canRecord ? (
            <Button href="/payments/new">Record receipt</Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          label="Yet to recover"
          value={currency.format(data.netReceivable)}
          hint={
            data.creditOutstanding > 0 || data.onAccountTotal > 0
              ? `${currency.format(data.outstanding)} billed, less ${currency.format(data.creditOutstanding + data.onAccountTotal)} credit held`
              : `across ${data.invoices.length} issued invoice${data.invoices.length === 1 ? '' : 's'}${data.openingBalances.length > 0 ? ` and ${data.openingBalances.length} opening balance${data.openingBalances.length === 1 ? '' : 's'}` : ''}`
          }
        />
        <Tile
          label="Overdue"
          value={currency.format(data.overdue)}
          hint={
            data.overdue > 0
              ? 'past the due date'
              : 'nothing past its due date'
          }
          tone={data.overdue > 0 ? 'alert' : 'plain'}
        />
        <Tile
          label="Yet to bill"
          value={currency.format(data.toBillTotal)}
          hint={`${data.toBill.length} order${data.toBill.length === 1 ? '' : 's'} delivered but not invoiced`}
        />
        <Tile
          label="Collected (30 days)"
          value={currency.format(data.collected30)}
          hint={`${data.collected30Count} payment${data.collected30Count === 1 ? '' : 's'} received`}
        />
        <Tile
          label="Not recoverable"
          value={currency.format(defaultedTotal)}
          hint={
            defaultedCount > 0
              ? `written off across ${defaultedCount} customer${defaultedCount === 1 ? '' : 's'}`
              : 'nothing written off'
          }
          tone={defaultedTotal > 0 ? 'bad' : 'plain'}
        />
      </div>

      <nav aria-label="Payments views" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            aria-current={tab === t.value ? 'page' : undefined}
            className={
              tab === t.value
                ? 'flex shrink-0 items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                : 'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
            }
          >
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-zinc-950/5 px-1.5 text-xs/5 tabular-nums dark:bg-white/10">
                {t.count}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'recover' ? (
        <>
      <div>
        <Subheading level={2}>Ageing</Subheading>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.aging.map((bucket) => (
            <div
              key={bucket.key}
              className="rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10"
            >
              <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
                {bucket.label}
              </div>
              <div className="mt-1 text-lg/7 font-semibold tabular-nums">
                {currency.format(bucket.amount)}
              </div>
              <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      <div>
        <Subheading level={2}>Outstanding by customer</Subheading>
        <div className="mt-4">
          {byCustomerRows.length === 0 ? (
            data.byCustomer.length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                description="Every issued invoice is fully settled."
              />
            ) : (
              <EmptyState
                title="No matches"
                description="No customer fits the current search."
                action={
                  <Button outline href={clearFilters('recover')}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
<>
            {q ? countLine(byCustomerRows.length, data.byCustomer.length, 'customer') : null}
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <SortHeader column="cust_name" label="Customer" params={sortParams} pathname="/payments" />
                  <SortHeader column="cust_invoices" label="Invoices" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_due" label="Due" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_overdue" label="Overdue" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_onaccount" label="On account" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_credit" label="Credit notes" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_net" label="Net" params={sortParams} pathname="/payments" align="right" />
                  <SortHeader column="cust_oldest" label="Oldest" params={sortParams} pathname="/payments" align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {byCustomerPaged.rows.map((row) => (
                  <TableRow key={row.id} href={`/customers/${row.id}/statement`}>
                    <TableCell className="font-medium">
                      {row.name}
                      {row.phone ? (
                        <div className="text-zinc-500 dark:text-zinc-400">
                          {row.phone}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.invoices}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {exact.format(row.due)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.overdue > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {exact.format(row.overdue)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.onAccount > 0 ? `−${exact.format(row.onAccount)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.credit > 0 ? `−${exact.format(row.credit)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {exact.format(row.net)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.oldestDays > 0 ? `${row.oldestDays}d` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
<Pagination paged={byCustomerPaged} params={params} pathname="/payments" pageKey="cp" sizeKey="cs" />
</>
          )}
        </div>
      </div>

      {data.invoices.length > 0 ? (
        <>
          <Divider />
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Subheading level={2}>Open invoices</Subheading>
              <FilterSelect
                param="age"
                label="Invoice age"
                allLabel="All"
                value={age}
                options={[
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'current', label: 'Not yet due' },
                ]}
              />
            </div>
            {q || age ? countLine(openRows.length, data.invoices.length, 'invoice') : null}
            <div className="mt-4">
              {openRows.length === 0 ? (
                <EmptyState
                  title="No matches"
                  description="No open invoice fits the current search and filters."
                  action={
                    <Button outline href={clearFilters('recover')}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
              <>
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <SortHeader column="inv_number" label="Invoice" params={sortParams} pathname="/payments" />
                    <SortHeader column="inv_customer" label="Customer" params={sortParams} pathname="/payments" />
                    <SortHeader column="inv_duedate" label="Due date" params={sortParams} pathname="/payments" />
                    <SortHeader column="inv_total" label="Total" params={sortParams} pathname="/payments" align="right" />
                    <SortHeader column="inv_paid" label="Received" params={sortParams} pathname="/payments" align="right" />
                    <SortHeader column="inv_balance" label="Balance" params={sortParams} pathname="/payments" align="right" />
                    <SortHeader column="inv_age" label="Age" params={sortParams} pathname="/payments" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {openPaged.rows.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                    >
                      <TableCell className="font-mono text-xs">
                        {invoice.number}
                        {invoice.order ? (
                          <div className="text-zinc-500 dark:text-zinc-400">
                            {invoice.order.number}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">
                        {invoice.customer.name}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {invoice.dueDate
                          ? dateFormat.format(invoice.dueDate)
                          : dateFormat.format(invoice.invoiceDate)}
                        {invoice.dueDate ? null : (
                          <div className="text-xs/5">no due date set</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {exact.format(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {exact.format(invoice.paid)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {exact.format(invoice.due)}
                      </TableCell>
                      <TableCell>
                        {invoice.overdueBy > 0 ? (
                          <Badge
                            color={invoice.overdueBy > 60 ? 'red' : 'amber'}
                          >
                            {invoice.overdueBy}d overdue
                          </Badge>
                        ) : (
                          <Badge color="zinc">Not due</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
<Pagination paged={openPaged} params={params} pathname="/payments" pageKey="ip" sizeKey="is" />
              </>
              )}
            </div>
          </div>
        </>
      ) : null}

        </>
      ) : null}

      {tab === 'tobill' && canSeeOrders ? (
        data.toBill.length === 0 ? (
          <EmptyState
            title="Everything delivered is billed"
            description="Completed orders show up here until an invoice is raised for them."
          />
        ) : toBillRows.length === 0 ? (
          <EmptyState
            title="No matches"
            description="No order fits the current search."
            action={
              <Button outline href={clearFilters('tobill')}>
                Clear filters
              </Button>
            }
          />
        ) : (
        <>
          <div>
            <Subheading level={2}>Delivered but not invoiced</Subheading>
            <Text className="mt-1">
              Raise an invoice so this becomes recoverable.
            </Text>
            {q ? countLine(toBillRows.length, data.toBill.length, 'order') : null}
            <div className="mt-4">
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <SortHeader column="bill_order" label="Order" params={sortParams} pathname="/payments" />
                    <SortHeader column="bill_customer" label="Customer" params={sortParams} pathname="/payments" />
                    <SortHeader column="bill_status" label="Status" params={sortParams} pathname="/payments" />
                    <SortHeader column="bill_date" label="Order date" params={sortParams} pathname="/payments" />
                    <SortHeader column="bill_value" label="Value" params={sortParams} pathname="/payments" align="right" />
                    <SortHeader column="bill_waiting" label="Waiting" params={sortParams} pathname="/payments" align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {toBillPaged.rows.map((order) => (
                    <TableRow key={order.id} href={`/orders/${order.id}`}>
                      <TableCell className="font-mono text-xs">
                        {order.number}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.customer.name}
                      </TableCell>
                      <TableCell>
                        <Badge color="zinc">
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {dateFormat.format(order.orderDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {exact.format(order.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.waitingDays}d
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination paged={toBillPaged} params={params} pathname="/payments" pageKey="bp" sizeKey="bs" />
            </div>
          </div>
        </>
        )
      ) : null}

      {tab === 'received' ? (
      <div>
        <Subheading level={2}>
          Payments
        </Subheading>
        <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
          <FilterSelect
            param="mode"
            label="Payment mode"
            allLabel="All"
            value={mode}
            options={Object.values(PaymentMode).map((value) => ({
              value,
              label: PAYMENT_MODE_LABELS[value],
            }))}
          />
          <form method="get" action="/payments" className="contents">
            {q ? <input type="hidden" name="q" value={String(params.q)} /> : null}
            <input type="hidden" name="tab" value="received" />
            {mode ? <input type="hidden" name="mode" value={mode} /> : null}
            {sortKeep.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <DateRangeFilter label="Received on" defaultFrom={from} defaultTo={to} autoSubmit />
            <RangeSlider
              label="Amount received"
              ceiling={receiptCeiling}
              defaultMin={minPaid}
              defaultMax={maxPaid}
              autoSubmit
              className="w-full sm:w-72"
            />
            {receiptsFiltered ? (
              <Button plain href={tabHref('received')}>
                Clear
              </Button>
            ) : null}
          </form>
        </div>
        {receiptsFiltered || q ? countLine(receipts.length, data.payments.length, 'payment') : null}
        <div className="mt-4">
          {receipts.length === 0 ? (
            data.payments.length === 0 && !receiptsFiltered && !q ? (
              <EmptyState
                title="No payments recorded"
                description="Payments show up here as you record them against invoices."
              />
            ) : (
              <EmptyState
                title="No payments match"
                description="No payment fits the current search and filters."
                action={
                  <Button outline href={clearFilters('received')}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <>
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <SortHeader column="recv_number" label="Receipt" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_date" label="Date" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_customer" label="Customer" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_applied" label="Applied to" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_mode" label="Mode" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_reference" label="Reference" params={sortParams} pathname="/payments" />
                  <SortHeader column="recv_amount" label="Amount" params={sortParams} pathname="/payments" align="right" />
                  <TableHeader className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {receiptsPaged.rows.map((payment) => (
                  <TableRow key={payment.id} href={`/payments/${payment.id}`}>
                    <TableCell className="font-mono text-xs">
                      {payment.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(payment.paidOn)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {payment.customer.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payment.isAdvance ? (
                        <span className="font-sans text-zinc-500 dark:text-zinc-400">
                          Order advance
                        </span>
                      ) : payment.invoiceNumbers.length === 0 ? (
                        <span className="font-sans text-amber-600 dark:text-amber-400">
                          On account
                        </span>
                      ) : (
                        payment.invoiceNumbers.join(', ')
                      )}
                      {payment.unallocated > 0 &&
                      payment.invoiceNumbers.length > 0 ? (
                        <div className="font-sans text-amber-600 dark:text-amber-400">
                          {exact.format(payment.unallocated)} on account
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{modeText(payment)}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {shortReference(payment.mode, payment.paymentDetails, payment.reference) || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {exact.format(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        name={payment.number}
                        viewHref={`/payments/${payment.id}`}
                        deleteAction={
                          can(user.role, 'payment:delete') && !payment.isAdvance
                            ? deleteReceipt.bind(null, payment.id)
                            : undefined
                        }
                        deleteTitle={`Delete ${payment.number}?`}
                        deleteDescription="This removes the receipt and unapplies it from any invoices, so their balances go back up. This cannot be undone."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination paged={receiptsPaged} params={params} pathname="/payments" pageKey="rp" sizeKey="rs" />
            </>
          )}
        </div>
      </div>
      ) : null}
    </div>
  )
}
