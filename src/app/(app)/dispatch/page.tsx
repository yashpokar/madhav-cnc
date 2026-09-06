import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
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
import { listDispatches } from '@/lib/queries/dispatches'
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

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function DispatchPage({
  searchParams,
}: PageProps<'/dispatch'>) {
  const user = await requireCapability('dispatch:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const dispatches = await listDispatches({ status: activeTab.status, search })
  const canCreate = can(user.role, 'dispatch:create')

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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/dispatch?${query.toString()}`
              : '/dispatch'

            return (
              <Link
                key={tab.value}
                href={href}
                className={
                  isActive
                    ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search challan, order, vehicle…" />
      </div>

      {dispatches.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No challans yet'}
          description={
            search
              ? 'Try a different challan, order number or vehicle.'
              : 'Raise a delivery challan when an order is ready to leave.'
          }
          action={
            canCreate && !search ? (
              <Button href="/dispatch/new">New challan</Button>
            ) : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Challan</TableHeader>
              <TableHeader>Order</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Vehicle</TableHeader>
              <TableHeader className="text-right">Lines</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {dispatches.map((dispatch) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
