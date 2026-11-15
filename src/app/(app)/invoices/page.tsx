import { moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteInvoice } from '@/lib/actions/invoices'
import { Badge } from '@/components/catalyst/badge'
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
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { DateCell } from '@/components/date-cell'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { countInvoices, listInvoices } from '@/lib/queries/invoices'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
} from '@/lib/labels'
import { InvoiceStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Invoices',
}

const TABS: { label: string; value: string; status?: InvoiceStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft', status: 'DRAFT' },
  { label: 'Issued', value: 'issued', status: 'ISSUED' },
  { label: 'Cancelled', value: 'cancelled', status: 'CANCELLED' },
]

export default async function InvoicesPage({
  searchParams,
}: PageProps<'/invoices'>) {
  const user = await requireCapability('invoice:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [invoices, totalCount] = await Promise.all([
    listInvoices({ status: activeTab.status, search }),
    countInvoices(),
  ])
  const canCreate = can(user.role, 'invoice:create')
  const canEdit = can(user.role, 'invoice:update')
  const canDelete = can(user.role, 'invoice:delete')

  const outstanding = invoices
    .filter((invoice) => invoice.status === 'ISSUED')
    .reduce((sum, invoice) => sum + invoice.due, 0)

  const filtered = applyListControls(invoices, params, {
    date: (row) => row.invoiceDate,
    amount: (row) => row.total,
  })
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    customer: (row) => row.customer.name,
    date: (row) => row.invoiceDate,
    total: (row) => row.total,
    due: (row) => row.due,
    payment: (row) => PAYMENT_STATE_LABELS[row.paymentState],
    status: (row) => INVOICE_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Invoices</Heading>
          <Text>
            {outstanding > 0
              ? `${currency.format(outstanding)} outstanding across issued invoices`
              : 'Nothing outstanding'}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="invoices" search={search} status={activeTab.status} />
          {canCreate ? <Button href="/invoices/new">New invoice</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search invoice, customer, order, PO…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/invoices"
        />
        <ListControls
          ceiling={amountCeiling(invoices, (row) => row.total)}
          params={params} pathname="/invoices" amountLabel="Total" />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/invoices"
          params={params}
          noun="invoice"
          emptyTitle="No invoices yet"
          emptyDescription="Raise an invoice from a completed order."
          action={canCreate ? <Button href="/invoices/new">New invoice</Button> : null}
        />
      ) : (
<>
        <ResultCount shown={sorted.length} total={totalCount} noun="invoice" filtered={isNarrowed} />
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Invoice" params={params} pathname="/invoices" />
              <SortHeader column="customer" label="Customer" params={params} pathname="/invoices" />
              <SortHeader column="date" label="Date" params={params} pathname="/invoices" />
              <SortHeader column="total" label="Total" params={params} pathname="/invoices" align="right" />
              <SortHeader column="due" label="Due" params={params} pathname="/invoices" align="right" />
              <SortHeader column="payment" label="Payment" params={params} pathname="/invoices" />
              <SortHeader column="status" label="Status" params={params} pathname="/invoices" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((invoice) => (
              <TableRow key={invoice.id} href={`/invoices/${invoice.id}`}>
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
                <TableCell>
                  <DateCell
                    date={invoice.invoiceDate}
                    dueDate={invoice.dueDate}
                    open={invoice.status === 'ISSUED' && invoice.due > 0}
                  />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(invoice.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(invoice.due)}
                </TableCell>
                <TableCell>
                  <Badge color={PAYMENT_STATE_COLORS[invoice.paymentState]}>
                    {PAYMENT_STATE_LABELS[invoice.paymentState]}
                  </Badge>
                  {invoice.writtenOff > 0 ? (
                    <div className="text-xs/5 text-rose-600 dark:text-rose-400">
                      {currency.format(invoice.writtenOff)} not recoverable
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge color={INVOICE_STATUS_COLORS[invoice.status]}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                  {invoice.isInterState ? (
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      IGST
                    </div>
                  ) : null}
                </TableCell>
              <TableCell>
                  <RowActions
                    name={invoice.number}
                    viewHref={`/invoices/${invoice.id}`}
                    editHref={canEdit && (invoice.status === 'DRAFT') ? `/invoices/${invoice.id}/edit` : undefined}
                    deleteAction={
                      canDelete
                        ? deleteInvoice.bind(null, invoice.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${invoice.number}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/invoices" />
</>
      )}
    </div>
  )
}
