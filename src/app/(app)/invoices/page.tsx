import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteInvoice } from '@/lib/actions/invoices'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { ExportButton } from '@/components/export-button'
import { Heading } from '@/components/catalyst/heading'
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
import { SearchField } from '@/components/search-field'
import { listInvoices } from '@/lib/queries/invoices'
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

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function InvoicesPage({
  searchParams,
}: PageProps<'/invoices'>) {
  const user = await requireCapability('invoice:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const invoices = await listInvoices({ status: activeTab.status, search })
  const canCreate = can(user.role, 'invoice:create')
  const canEdit = can(user.role, 'invoice:update')
  const canDelete = can(user.role, 'invoice:delete')

  const outstanding = invoices
    .filter((invoice) => invoice.status === 'ISSUED')
    .reduce((sum, invoice) => sum + invoice.due, 0)

  const sorted = applyListControls(invoices, params, {
    date: (row) => row.invoiceDate,
    amount: (row) => row.total,
    due: (row) => row.due,
  })
  const paged = paginate(sorted, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/invoices?${query.toString()}`
              : '/invoices'

            return (
              <Link
                key={tab.value}
                href={href}
                className={
                  isActive
                    ? 'shrink-0 rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'shrink-0 rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search invoice, customer, order…" />
      </div>

      <ListControls params={params} pathname="/invoices" amountLabel="Total" withDue />

      {invoices.length > 0 && sorted.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Nothing falls in this amount range. Widen it or clear the filter."
        />
      ) : invoices.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No invoices yet'}
          description={
            search
              ? 'Try a different invoice number or customer.'
              : 'Raise an invoice from a completed order.'
          }
          action={
            canCreate && !search ? (
              <Button href="/invoices/new">New invoice</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Invoice</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
              <TableHeader className="text-right">Due</TableHeader>
              <TableHeader>Payment</TableHeader>
              <TableHeader>Status</TableHeader>
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
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(invoice.invoiceDate)}
                  {invoice.dueDate ? (
                    <div>due {dateFormat.format(invoice.dueDate)}</div>
                  ) : null}
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
                      canDelete && (invoice.status === 'DRAFT')
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
