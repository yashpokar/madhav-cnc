import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { DeleteImpact } from '@/components/delete-impact'
import { describeOrderDelete } from '@/lib/order-delete'
import { deleteOrder } from '@/lib/actions/orders'
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
import { DateCell } from '@/components/date-cell'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { countOrders, listOrders } from '@/lib/queries/orders'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  MATERIAL_SUMMARY_COLORS,
  MATERIAL_SUMMARY_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/labels'
import { OrderStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Orders',
}

const TABS: { label: string; value: string; status?: OrderStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed', status: 'CONFIRMED' },
  { label: 'In production', value: 'production', status: 'IN_PRODUCTION' },
  { label: 'Ready', value: 'ready', status: 'READY' },
  { label: 'Dispatched', value: 'dispatched', status: 'DISPATCHED' },
  { label: 'Completed', value: 'completed', status: 'COMPLETED' },
]

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  const user = await requireCapability('order:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [orders, totalCount] = await Promise.all([
    listOrders({ status: activeTab.status, search }),
    countOrders(),
  ])
  const canCreate = can(user.role, 'order:create')
  const canEdit = can(user.role, 'order:update')
  const canDelete = can(user.role, 'order:delete')

  const filtered = applyListControls(orders, params, {
    date: (row) => row.orderDate,
    amount: (row) => row.total,
  })
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    customer: (row) => row.customer.name,
    subject: (row) => row.subject,
    material: (row) => MATERIAL_SUMMARY_LABELS[row.materialSummary],
    date: (row) => row.orderDate,
    lines: (row) => row._count.lines,
    total: (row) => row.total,
    status: (row) => ORDER_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Orders</Heading>
          <Text>
            {totalCount} order{totalCount === 1 ? '' : 's'}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="orders" search={search} status={activeTab.status} />
          {canCreate ? (
            <Button href="/orders/new">New order</Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search number, customer, subject, PO…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/orders"
        />
        <ListControls
          ceiling={amountCeiling(orders, (row) => row.total)}
          params={params} pathname="/orders" amountLabel="Total" />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/orders"
          params={params}
          noun="order"
          emptyTitle="No orders yet"
          emptyDescription="Create an order directly, or convert an accepted quotation."
          action={canCreate ? <Button href="/orders/new">New order</Button> : null}
        />
      ) : (
<>
        <ResultCount shown={sorted.length} total={totalCount} noun="order" filtered={isNarrowed} />
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Number" params={params} pathname="/orders" />
              <SortHeader column="customer" label="Customer" params={params} pathname="/orders" />
              <SortHeader column="subject" label="Subject" params={params} pathname="/orders" />
              <SortHeader column="material" label="Material" params={params} pathname="/orders" />
              <SortHeader column="date" label="Date" params={params} pathname="/orders" />
              <SortHeader column="lines" label="Lines" params={params} pathname="/orders" align="right" />
              <SortHeader column="total" label="Total" params={params} pathname="/orders" align="right" />
              <SortHeader column="status" label="Status" params={params} pathname="/orders" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((order) => (
              <TableRow key={order.id} href={`/orders/${order.id}`}>
                <TableCell className="font-mono text-xs">
                  {order.number}
                  {order.quotation ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      from {order.quotation.number}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{order.customer.name}</div>
                  {order.architect ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      via {order.architect.name}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {order.subject ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge color={MATERIAL_SUMMARY_COLORS[order.materialSummary]}>
                    {MATERIAL_SUMMARY_LABELS[order.materialSummary]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DateCell
                    date={order.orderDate}
                    dueDate={order.dueDate}
                    open={!['COMPLETED', 'DISPATCHED', 'CANCELLED'].includes(order.status)}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {order._count.lines}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(order.total)}
                </TableCell>
                <TableCell>
                  <Badge color={ORDER_STATUS_COLORS[order.status]}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </TableCell>
              <TableCell>
                  <RowActions
                    name={order.number}
                    viewHref={`/orders/${order.id}`}
                    editHref={
                      canEdit && order.status !== 'CANCELLED' && order.impact.invoices.length === 0
                        ? `/orders/${order.id}/edit`
                        : undefined
                    }
                    deleteAction={canDelete ? deleteOrder.bind(null, order.id) : undefined}
                    deleteTitle={`Delete order ${order.number}?`}
                    deleteBlocked={describeOrderDelete(order.impact).blocked}
                    deleteDescription={<DeleteImpact {...describeOrderDelete(order.impact)} />}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/orders" />
</>
      )}
    </div>
  )
}
