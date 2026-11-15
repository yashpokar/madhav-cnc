import { moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteBill } from '@/lib/actions/purchase-bills'
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
import { countBills, listBills } from '@/lib/queries/purchases'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  BILL_PAYMENT_COLORS,
  BILL_PAYMENT_LABELS,
  BILL_STATUS_COLORS,
  BILL_STATUS_LABELS,
} from '@/lib/labels'
import type { PurchaseBillStatus } from '@/generated/prisma/enums'
import type { PaymentStatus } from '@/lib/purchase-rules'

export const metadata: Metadata = {
  title: 'Purchase bills',
}

const TABS: { label: string; value: string; status?: PurchaseBillStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft', status: 'DRAFT' },
  { label: 'Posted', value: 'posted', status: 'POSTED' },
  { label: 'Cancelled', value: 'cancelled', status: 'CANCELLED' },
]

const PAY_CHIPS: { label: string; value: string; status?: PaymentStatus }[] = [
  { label: 'Any payment status', value: 'all' },
  { label: 'Paid', value: 'paid', status: 'PAID' },
  { label: 'Part paid', value: 'part', status: 'PART_PAID' },
  { label: 'Unpaid', value: 'unpaid', status: 'UNPAID' },
  { label: 'Overdue', value: 'overdue', status: 'OVERDUE' },
]

export default async function PurchaseBillsPage({
  searchParams,
}: PageProps<'/purchase-bills'>) {
  const user = await requireCapability('purchase:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const payValue = typeof params.pay === 'string' ? params.pay : 'all'
  const activePay = PAY_CHIPS.find((chip) => chip.value === payValue) ?? PAY_CHIPS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [bills, totalCount] = await Promise.all([
    listBills({ status: activeTab.status, search }),
    countBills(),
  ])
  const canCreate = can(user.role, 'purchase:create')
  const canEdit = can(user.role, 'purchase:update')
  const canDelete = can(user.role, 'purchase:delete')

  const owed = bills.reduce((sum, bill) => sum + bill.due, 0)
  const overdue = bills
    .filter((bill) => bill.paymentStatus === 'OVERDUE')
    .reduce((sum, bill) => sum + bill.due, 0)

  const byPayment = activePay.status
    ? bills.filter((bill) => bill.paymentStatus === activePay.status)
    : bills
  const filtered = applyListControls(byPayment, params, {
    date: (row) => row.billDate,
    amount: (row) => row.total,
  })
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    vendor: (row) => row.vendor.name,
    date: (row) => row.billDate,
    total: (row) => row.total,
    due: (row) => row.due,
    payment: (row) => (row.paymentStatus ? BILL_PAYMENT_LABELS[row.paymentStatus] : ''),
    status: (row) => BILL_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(
    params,
    activeTab.value === 'all' && activePay.value === 'all' ? 'all' : 'narrowed',
  )

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Purchase bills</Heading>
          <Text>
            {owed > 0
              ? `${currency.format(owed)} owed to vendors${overdue > 0 ? `, ${currency.format(overdue)} overdue` : ''}`
              : 'Nothing owed to vendors'}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="purchase-bills" search={search} status={activeTab.status} />
          {canCreate ? <Button href="/purchase-bills/new">New bill</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search bill, vendor, vendor bill no…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/purchase-bills"
        />
        <StatusFilter
          label="Payment"
          paramKey="pay"
          options={PAY_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
          value={activePay.value}
          params={params}
          pathname="/purchase-bills"
        />
        <ListControls
          ceiling={amountCeiling(bills, (row) => row.total)}
          params={params}
          pathname="/purchase-bills"
          amountLabel="Total"
        />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/purchase-bills"
          params={params}
          noun="bill"
          emptyTitle="No purchase bills yet"
          emptyDescription="Record what a vendor has billed you, or raise one from a purchase order."
          action={canCreate ? <Button href="/purchase-bills/new">New bill</Button> : null}
        />
      ) : (
        <>
          <ResultCount shown={sorted.length} total={totalCount} noun="bill" filtered={isNarrowed} />
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <SortHeader column="number" label="Bill" params={params} pathname="/purchase-bills" />
                <SortHeader column="vendor" label="Vendor" params={params} pathname="/purchase-bills" />
                <SortHeader column="date" label="Date" params={params} pathname="/purchase-bills" />
                <SortHeader column="total" label="Total" params={params} pathname="/purchase-bills" align="right" />
                <SortHeader column="due" label="Balance" params={params} pathname="/purchase-bills" align="right" />
                <SortHeader column="payment" label="Payment" params={params} pathname="/purchase-bills" />
                <SortHeader column="status" label="Status" params={params} pathname="/purchase-bills" />
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((bill) => (
                <TableRow key={bill.id} href={`/purchase-bills/${bill.id}`}>
                  <TableCell className="font-mono text-xs">
                    {bill.number}
                    {bill.vendorBillNumber ? (
                      <div className="text-zinc-500 dark:text-zinc-400">
                        {bill.vendorBillNumber}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">{bill.vendor.name}</TableCell>
                  <TableCell>
                    <DateCell
                      date={bill.billDate}
                      dueDate={bill.dueDate}
                      open={bill.paymentStatus === 'OVERDUE'}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currency.format(bill.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {bill.status === 'POSTED' ? currency.format(bill.due) : '—'}
                  </TableCell>
                  <TableCell>
                    {bill.paymentStatus ? (
                      <Badge color={BILL_PAYMENT_COLORS[bill.paymentStatus]}>
                        {BILL_PAYMENT_LABELS[bill.paymentStatus]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge color={BILL_STATUS_COLORS[bill.status]}>
                      {BILL_STATUS_LABELS[bill.status]}
                    </Badge>
                    {bill.isInterState ? (
                      <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">IGST</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={bill.number}
                      viewHref={`/purchase-bills/${bill.id}`}
                      editHref={
                        canEdit && bill.status === 'DRAFT'
                          ? `/purchase-bills/${bill.id}/edit`
                          : undefined
                      }
                      deleteAction={
                        canDelete && bill.status !== 'POSTED'
                          ? deleteBill.bind(null, bill.id)
                          : undefined
                      }
                      deleteTitle={`Delete ${bill.number}?`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/purchase-bills" />
        </>
      )}
    </div>
  )
}
