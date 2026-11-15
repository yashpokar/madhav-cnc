import { date as dateFormat, money as exact } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import type { Metadata } from 'next'
import { RowActions } from '@/components/row-actions'
import { deleteVendorPayment } from '@/lib/actions/vendor-payments'
import { DateRangeFilter } from '@/components/date-range-filter'
import { readDateRange } from '@/lib/list-controls'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { FilterSelect } from '@/components/filter-select'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { PaymentMode } from '@/generated/prisma/enums'
import { paginate } from '@/lib/pagination'
import { Button } from '@/components/catalyst/button'
import { ExportButton } from '@/components/export-button'
import { Heading } from '@/components/catalyst/heading'
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
import { listVendorPayments } from '@/lib/queries/vendor-payments'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Vendor payments',
}

const PATH = '/vendor-payments'

export default async function VendorPaymentsPage({
  searchParams,
}: PageProps<'/vendor-payments'>) {
  const user = await requireCapability('purchase:read')
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const modeParam = typeof params.mode === 'string' ? params.mode : undefined
  const mode = Object.values(PaymentMode).find((value) => value === modeParam)
  const { from, to } = readDateRange(params)
  const filtered = Boolean(q || mode || from || to)

  const all = await listVendorPayments({ search: q, from, to, mode })
  const rows = sortRows(all, params, {
    number: (row) => row.number,
    date: (row) => row.paidOn,
    vendor: (row) => row.vendor.name,
    applied: (row) => row.billNumbers.join(' '),
    mode: (row) => modeText(row),
    reference: (row) => row.reference,
    amount: (row) => row.amount,
  })
  const paged = paginate(rows, params)
  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  const canCreate = can(user.role, 'purchase:update')
  const canDelete = can(user.role, 'purchase:delete')
  const sortParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => key !== 'page'),
  )
  const sortKeep = (['sort', 'dir'] as const).flatMap((key) => {
    const value = params[key]

    return typeof value === 'string' ? [[key, value] as const] : []
  })

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Vendor payments</Heading>
          <Text>Money paid out to vendors, and which bills it settled.</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField placeholder="Search vendor, number, reference…" />
          <ExportButton kind="vendor-payments" search={q || undefined} />
          {canCreate ? <Button href="/vendor-payments/new">Record payment</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
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
        <form method="get" action={PATH} className="contents">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {mode ? <input type="hidden" name="mode" value={mode} /> : null}
          {sortKeep.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <DateRangeFilter label="Paid on" defaultFrom={from} defaultTo={to} autoSubmit />
          {filtered ? (
            <Button plain href={PATH}>
              Clear
            </Button>
          ) : null}
        </form>
        {rows.length > 0 ? (
          <span className="pb-2 text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
            {rows.length} payment{rows.length === 1 ? '' : 's'} · {exact.format(total)}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No payments match"
            description="No payment fits the current search and filters."
            action={
              <Button outline href={PATH}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No vendor payments yet"
            description="Record a payment against a vendor's bills to see it here."
            action={canCreate ? <Button href="/vendor-payments/new">Record payment</Button> : null}
          />
        )
      ) : (
        <>
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <SortHeader column="number" label="Payment" params={sortParams} pathname={PATH} />
                <SortHeader column="date" label="Date" params={sortParams} pathname={PATH} />
                <SortHeader column="vendor" label="Vendor" params={sortParams} pathname={PATH} />
                <SortHeader column="applied" label="Applied to" params={sortParams} pathname={PATH} />
                <SortHeader column="mode" label="Mode" params={sortParams} pathname={PATH} />
                <SortHeader column="reference" label="Reference" params={sortParams} pathname={PATH} />
                <SortHeader column="amount" label="Amount" params={sortParams} pathname={PATH} align="right" />
                <TableHeader className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((payment) => (
                <TableRow key={payment.id} href={`/vendor-payments/${payment.id}`}>
                  <TableCell className="font-mono text-xs">{payment.number}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {dateFormat.format(payment.paidOn)}
                  </TableCell>
                  <TableCell className="font-medium">{payment.vendor.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {payment.billNumbers.length === 0 && payment.openingApplied <= 0 ? (
                      <span className="font-sans text-amber-600 dark:text-amber-400">
                        Advance to vendor
                      </span>
                    ) : (
                      [
                        ...payment.billNumbers,
                        ...(payment.openingApplied > 0 ? ['Opening payable'] : []),
                      ].join(', ')
                    )}
                    {payment.advance > 0 &&
                    (payment.billNumbers.length > 0 || payment.openingApplied > 0) ? (
                      <div className="font-sans text-amber-600 dark:text-amber-400">
                        {exact.format(payment.advance)} advance
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{modeText(payment)}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {payment.reference ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {exact.format(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={payment.number}
                      viewHref={`/vendor-payments/${payment.id}`}
                      deleteAction={
                        canDelete ? deleteVendorPayment.bind(null, payment.id) : undefined
                      }
                      deleteTitle={`Delete ${payment.number}?`}
                      deleteDescription="This removes the payment and unapplies it from any bills, so their balances go back up. This cannot be undone."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname={PATH} />
        </>
      )}
    </div>
  )
}
