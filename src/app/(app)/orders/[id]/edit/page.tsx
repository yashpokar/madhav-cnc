import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateOrder } from '@/lib/actions/orders'
import { getOrder } from '@/lib/queries/orders'
import { listCustomerOptions, listItemOptions } from '@/lib/queries/quotations'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { OrderForm } from '../../order-form'

export const metadata: Metadata = {
  title: 'Edit order',
}

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null
}

export default async function EditOrderPage({
  params,
}: PageProps<'/orders/[id]/edit'>) {
  await requireCapability('order:update')
  const { id } = await params

  const [order, customers, items, architects, carpenters] = await Promise.all([
    getOrder(id),
    listCustomerOptions(),
    listItemOptions(),
    listPartnerOptions('ARCHITECT'),
    listPartnerOptions('CARPENTER'),
  ])

  if (!order) {
    notFound()
  }

  const action = updateOrder.bind(null, order.id)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{order.number}</Heading>
        <Text>{order.customer.name}</Text>
      </div>

      <OrderForm
        action={action}
        submitLabel="Save changes"
        customers={customers}
        items={items}
        architects={architects}
        carpenters={carpenters}
        values={{
          customerId: order.customerId,
          architectId: order.architectId,
          carpenterId: order.carpenterId,
          subject: order.subject,
          customerPoNumber: order.customerPoNumber,
          orderDate: dateInput(order.orderDate) ?? '',
          dueDate: dateInput(order.dueDate),
          siteAddress: order.siteAddress,
          siteCity: order.siteCity,
          sitePincode: order.sitePincode,
          discountType: order.discountType,
          discountValue: order.discountValue,
          advanceAmount: order.advanceAmount,
          transportCharge: order.transportCharge,
          transportTaxRatePercent: order.transportTaxRatePercent,
          notes: order.notes,
          terms: order.terms,
          lines: order.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            description: line.description,
            unit: line.unit,
            materialSupply: line.materialSupply,
            isFlatRate: line.isFlatRate,
            dimensionUnit: line.dimensionUnit,
            length: line.length === null ? '' : String(line.length),
            width: line.width === null ? '' : String(line.width),
            pieces: line.pieces === null ? '' : String(line.pieces),
            quantity: String(line.quantity),
            rate: String(line.rate),
            discountPercent: String(line.discountPercent),
            taxRatePercent: String(line.taxRatePercent),
            hsnCode: line.hsnCode,
            notes: line.notes,
          })),
        }}
      />
    </div>
  )
}
