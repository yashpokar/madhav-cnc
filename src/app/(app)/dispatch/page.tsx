import { date as dateFormat } from '@/lib/format'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deleteDispatch } from '@/lib/actions/dispatches'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
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
import { inDateRange } from '@/lib/list-controls'
import {
  DateFilter,
  ListEmpty,
  ResultCount,
  isFiltered,

} from '@/components/list-filter-ui'
import { countDispatches, listDispatches } from '@/lib/queries/dispatches'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { DISPATCH_STATUS_COLORS, DISPATCH_STATUS_LABELS } from '@/lib/labels'
import { DispatchStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Dispatch',
}

const TABS: { label: string; value: string; status?: DispatchStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft', status: 'DRAFT' },
  { label: 'Dispatched', value: 'dispatched', status: 'DISPATCHED' },
  { label: 'Delivered', value: 'delivered', status: 'DELIVERED' },
]

export default async function DispatchPage({
  searchParams,
}: PageProps<'/dispatch'>) {
  const user = await requireCapability('dispatch:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [dispatches, totalCount] = await Promise.all([
    listDispatches({ status: activeTab.status, search }),
    countDispatches(),
  ])
  const canCreate = can(user.role, 'dispatch:create')
  const canEdit = can(user.role, 'dispatch:update')
  const canDelete = can(user.role, 'dispatch:delete')

  const filtered = dispatches.filter((row) => inDateRange(row.dispatchDate, params))
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    order: (row) => row.order.number,
    customer: (row) => row.order.customer.name,
    date: (row) => row.dispatchDate,
    vehicle: (row) => row.vehicleNumber,
    lines: (row) => row._count.lines,
    status: (row) => DISPATCH_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Dispatch</Heading>
          <Text>
            Delivery challans. An order can go out in more than one trip.
          </Text>
        </div>
        {canCreate ? <Button href="/dispatch/new">New challan</Button> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search challan, order, customer, vehicle, driver…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/dispatch"
        />
        <DateFilter params={params} pathname="/dispatch" />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/dispatch"
          params={params}
          noun="challan"
          emptyTitle="No challans yet"
          emptyDescription="Raise a delivery challan when an order is ready to leave."
          action={canCreate ? <Button href="/dispatch/new">New challan</Button> : null}
        />
      ) : (
<>
        <ResultCount shown={sorted.length} total={totalCount} noun="challan" filtered={isNarrowed} />
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Challan" params={params} pathname="/dispatch" />
              <SortHeader column="order" label="Order" params={params} pathname="/dispatch" />
              <SortHeader column="customer" label="Customer" params={params} pathname="/dispatch" />
              <SortHeader column="date" label="Date" params={params} pathname="/dispatch" />
              <SortHeader column="vehicle" label="Vehicle" params={params} pathname="/dispatch" />
              <SortHeader column="lines" label="Lines" params={params} pathname="/dispatch" align="right" />
              <SortHeader column="status" label="Status" params={params} pathname="/dispatch" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((dispatch) => (
              <TableRow key={dispatch.id} href={`/dispatch/${dispatch.id}`}>
                <TableCell className="font-mono text-xs">
                  {dispatch.number}
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {dispatch.order.number}
                </TableCell>
                <TableCell className="font-medium">
                  {dispatch.order.customer.name}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(dispatch.dispatchDate)}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dispatch.vehicleNumber ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {dispatch._count.lines}
                </TableCell>
                <TableCell>
                  <Badge color={DISPATCH_STATUS_COLORS[dispatch.status]}>
                    {DISPATCH_STATUS_LABELS[dispatch.status]}
                  </Badge>
                  {dispatch.receivedByName ? (
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      {dispatch.receivedByName}
                    </div>
                  ) : null}
                </TableCell>
              <TableCell>
                  <RowActions
                    name={dispatch.number}
                    viewHref={`/dispatch/${dispatch.id}`}
                    editHref={canEdit && (dispatch.status === 'DRAFT' || dispatch.status === 'DISPATCHED') ? `/dispatch/${dispatch.id}/edit` : undefined}
                    deleteAction={
                      canDelete && (dispatch.status === 'DRAFT' || dispatch.status === 'CANCELLED')
                        ? deleteDispatch.bind(null, dispatch.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${dispatch.number}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/dispatch" />
</>
      )}
    </div>
  )
}
