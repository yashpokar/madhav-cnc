import { moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteOrder } from '@/lib/actions/purchase-orders'
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
import { date as dateFormat } from '@/lib/format'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { countPurchaseOrders, listPurchaseOrders } from '@/lib/queries/purchases'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { canEditOrder } from '@/lib/purchase-rules'
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '@/lib/labels'
import type { PurchaseOrderStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Purchase orders',
}

const TABS: { label: string; value: string; status?: PurchaseOrderStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft', status: 'DRAFT' },
  { label: 'Sent', value: 'sent', status: 'SENT' },
  { label: 'Part received', value: 'partial', status: 'PARTIAL' },
  { label: 'Received', value: 'received', status: 'RECEIVED' },
  { label: 'Cancelled', value: 'cancelled', status: 'CANCELLED' },
]

export default async function PurchaseOrdersPage({
  searchParams,
}: PageProps<'/purchase-orders'>) {
  const user = await requireCapability('purchase:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [orders, totalCount] = await Promise.all([
    listPurchaseOrders({ status: activeTab.status, search }),
    countPurchaseOrders(),
  ])
  const canCreate = can(user.role, 'purchase:create')
  const canEdit = can(user.role, 'purchase:update')
  const canDelete = can(user.role, 'purchase:delete')

  const filtered = applyListControls(orders, params, {
    date: (row) => row.orderDate,
    amount: (row) => row.total,
  })
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    vendor: (row) => row.vendor.name,
    date: (row) => row.orderDate,
    expected: (row) => row.expectedDate ?? new Date(0),
    total: (row) => row.total,
    status: (row) => PO_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Purchase orders</Heading>
          <Text>What you have asked vendors to supply.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="purchase-orders" search={search} status={activeTab.status} />
          {canCreate ? <Button href="/purchase-orders/new">New order</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search order or vendor…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/purchase-orders"
        />
        <ListControls
          ceiling={amountCeiling(orders, (row) => row.total)}
          params={params}
          pathname="/purchase-orders"
          amountLabel="Total"
        />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/purchase-orders"
          params={params}
          noun="order"
          emptyTitle="No purchase orders yet"
          emptyDescription="Raise an order to tell a vendor what you need and by when."
          action={canCreate ? <Button href="/purchase-orders/new">New order</Button> : null}
        />
      ) : (
        <>
          <ResultCount shown={sorted.length} total={totalCount} noun="order" filtered={isNarrowed} />
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <SortHeader column="number" label="Order" params={params} pathname="/purchase-orders" />
                <SortHeader column="vendor" label="Vendor" params={params} pathname="/purchase-orders" />
                <SortHeader column="date" label="Date" params={params} pathname="/purchase-orders" />
                <SortHeader column="expected" label="Expected" params={params} pathname="/purchase-orders" />
                <SortHeader column="total" label="Total" params={params} pathname="/purchase-orders" align="right" />
                <SortHeader column="status" label="Status" params={params} pathname="/purchase-orders" />
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((order) => (
                <TableRow key={order.id} href={`/purchase-orders/${order.id}`}>
                  <TableCell className="font-mono text-xs">{order.number}</TableCell>
                  <TableCell className="font-medium">{order.vendor.name}</TableCell>
                  <TableCell className="tabular-nums">{dateFormat.format(order.orderDate)}</TableCell>
                  <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {order.expectedDate ? dateFormat.format(order.expectedDate) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currency.format(order.total)}
                  </TableCell>
                  <TableCell>
                    <Badge color={PO_STATUS_COLORS[order.status]}>
                      {PO_STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={order.number}
                      viewHref={`/purchase-orders/${order.id}`}
                      editHref={
                        canEdit && canEditOrder(order.status)
                          ? `/purchase-orders/${order.id}/edit`
                          : undefined
                      }
                      deleteAction={
                        canDelete && (order.status === 'DRAFT' || order.status === 'CANCELLED')
                          ? deleteOrder.bind(null, order.id)
                          : undefined
                      }
                      deleteTitle={`Delete ${order.number}?`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/purchase-orders" />
        </>
      )}
    </div>
  )
}
