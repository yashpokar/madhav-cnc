import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { updateDispatch } from '@/lib/actions/dispatches'
import { getDispatch, getOrderForDispatch } from '@/lib/queries/dispatches'
import { requireCapability } from '@/lib/session'
import { DispatchForm } from '../../dispatch-form'

export const metadata: Metadata = {
  title: 'Edit delivery challan',
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

export default async function EditDispatchPage({
  params,
}: PageProps<'/dispatch/[id]/edit'>) {
  await requireCapability('dispatch:update')
  const { id } = await params

  const dispatch = await getDispatch(id)

  if (!dispatch) {
    notFound()
  }

  if (dispatch.status === 'DELIVERED' || dispatch.status === 'CANCELLED') {
    return (
      <EmptyState
        title="This challan can no longer be edited"
        description={`A ${dispatch.status.toLowerCase()} challan is fixed. Reopen it first if something needs changing.`}
      />
    )
  }

  const order = await getOrderForDispatch(dispatch.order.id)

  if (!order) {
    notFound()
  }

  const onThisChallan = new Map(
    dispatch.lines.map((line) => [line.orderLineId, line.quantity]),
  )

  const lines = order.lines.map((line) => {
    const own = onThisChallan.get(line.id) ?? 0

    return {
      ...line,
      dispatched: Math.round((line.dispatched - own) * 1000) / 1000,
      remaining: Math.round((line.remaining + own) * 1000) / 1000,
    }
  })

  const action = updateDispatch.bind(null, dispatch.id)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{dispatch.number}</Heading>
        <Text>
          {dispatch.order.customer.name} · {dispatch.order.number}
        </Text>
      </div>

      <DispatchForm
        action={action}
        submitLabel="Save changes"
        orderNumber={dispatch.order.number}
        lines={lines}
        values={{
          orderId: dispatch.order.id,
          dispatchDate: dateInput(dispatch.dispatchDate),
          vehicleNumber: dispatch.vehicleNumber,
          driverName: dispatch.driverName,
          driverPhone: dispatch.driverPhone,
          transporterName: dispatch.transporterName,
          lrNumber: dispatch.lrNumber,
          deliveryAddress: dispatch.deliveryAddress,
          deliveryCity: dispatch.deliveryCity,
          deliveryPincode: dispatch.deliveryPincode,
          notes: dispatch.notes,
          quantities: Object.fromEntries(
            order.lines.map((line) => [
              line.id,
              String(onThisChallan.get(line.id) ?? ''),
            ]),
          ),
        }}
      />
    </div>
  )
}
