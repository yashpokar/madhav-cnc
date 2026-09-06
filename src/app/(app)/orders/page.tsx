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
import { listOrders } from '@/lib/queries/orders'
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

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  const user = await requireCapability('order:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const orders = await listOrders({ status: activeTab.status, search })
  const canCreate = can(user.role, 'order:create')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Orders</Heading>
          <Text>
            {orders.length} order{orders.length === 1 ? '' : 's'}
          </Text>
        </div>
        {canCreate ? (
          <Button href="/orders/new">New order</Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/orders?${query.toString()}`
              : '/orders'

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
        <SearchField placeholder="Search number, customer, PO…" />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No orders yet'}
          description={
            search
              ? 'Try a different number, customer or subject.'
              : 'Create an order directly, or convert an accepted quotation.'
          }
          action={
            canCreate && !search ? (
              <Button href="/orders/new">New order</Button>
            ) : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Number</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Subject</TableHeader>
              <TableHeader>Material</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader className="text-right">Lines</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
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
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(order.orderDate)}
                  {order.dueDate ? (
                    <div>due {dateFormat.format(order.dueDate)}</div>
                  ) : null}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
