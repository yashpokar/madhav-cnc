import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
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
import { createDispatch } from '@/lib/actions/dispatches'
import {
  getOrderForDispatch,
  listDispatchableOrders,
} from '@/lib/queries/dispatches'
import { requireCapability } from '@/lib/session'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels'
import { DispatchForm } from '../dispatch-form'

export const metadata: Metadata = {
  title: 'New delivery challan',
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function NewDispatchPage({
  searchParams,
}: PageProps<'/dispatch/new'>) {
  await requireCapability('dispatch:create')
  const params = await searchParams
  const orderId = typeof params.order === 'string' ? params.order : null

  if (!orderId) {
    const orders = await listDispatchableOrders()

    return (
      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 gap-2">
          <Heading>New delivery challan</Heading>
          <Text>Pick the order this consignment belongs to.</Text>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="Nothing to dispatch"
            description="Orders appear here once they are in production or ready."
          />
        ) : (
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Order</TableHeader>
                <TableHeader>Customer</TableHeader>
                <TableHeader>Subject</TableHeader>
                <TableHeader>Due</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} href={`/dispatch/new?order=${order.id}`}>
                  <TableCell className="font-mono text-xs">
                    {order.number}
                  </TableCell>
                  <TableCell className="font-medium">
                    {order.customer.name}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {order.subject ?? '—'}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {order.dueDate ? dateFormat.format(order.dueDate) : '—'}
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

  const order = await getOrderForDispatch(orderId)

  if (!order) {
    return (
      <EmptyState
        title="Order not found"
        description="It may have been removed."
      />
    )
  }

  const pending = order.lines.filter((line) => line.remaining > 0)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New delivery challan</Heading>
        <Text>
          {order.customer.name} · {order.number}
          {order.subject ? ` · ${order.subject}` : ''}
        </Text>
        <Text>
          <Link href="/dispatch/new" className="underline">
            Choose a different order
          </Link>
        </Text>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          title="Everything has been dispatched"
          description="Every line on this order has already gone out."
        />
      ) : (
        <DispatchForm
          action={createDispatch}
          submitLabel="Save challan"
          orderNumber={order.number}
          lines={order.lines}
          values={{
            orderId: order.id,
            dispatchDate: today,
            vehicleNumber: null,
            driverName: null,
            driverPhone: null,
            transporterName: null,
            lrNumber: null,
            deliveryAddress: order.siteAddress,
            deliveryCity: order.siteCity,
            deliveryPincode: order.sitePincode,
            notes: null,
            quantities: Object.fromEntries(
              order.lines.map((line) => [
                line.id,
                line.remaining > 0 ? String(line.remaining) : '',
              ]),
            ),
          }}
        />
      )}
    </div>
  )
}
