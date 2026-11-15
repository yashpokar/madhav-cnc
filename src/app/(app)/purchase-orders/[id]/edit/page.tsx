import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { updateOrder } from '@/lib/actions/purchase-orders'
import {
  getPurchaseOrder,
  listPurchasableOptions,
  listPurchaseVendorOptions,
} from '@/lib/queries/purchases'
import { canEditOrder } from '@/lib/purchase-rules'
import { requireCapability } from '@/lib/session'
import { OrderForm } from '../../order-form'

export const metadata: Metadata = {
  title: 'Edit purchase order',
}

const dateInput = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

export default async function EditOrderPage({
  params,
}: PageProps<'/purchase-orders/[id]/edit'>) {
  await requireCapability('purchase:update')
  const { id } = await params

  const order = await getPurchaseOrder(id)

  if (!order) notFound()

  if (!canEditOrder(order.status)) {
    return (
      <EmptyState
        title="This purchase order can no longer be edited"
        description="Orders that are cancelled, or that goods have been received against, are fixed."
      />
    )
  }

  const [vendors, options] = await Promise.all([
    listPurchaseVendorOptions(),
    listPurchasableOptions(),
  ])

  const vendorList = vendors.some((row) => row.id === order.vendorId)
    ? vendors
    : [
        ...vendors,
        { id: order.vendor.id, name: order.vendor.name, gstin: order.vendor.gstin, detail: '' },
      ]

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{order.number}</Heading>
        <Text>{order.vendor.name}</Text>
      </div>

      <OrderForm
        action={updateOrder.bind(null, order.id)}
        submitLabel="Save changes"
        vendors={vendorList}
        options={options}
        values={{
          vendorId: order.vendorId,
          vendorName: order.vendor.name,
          orderDate: dateInput(order.orderDate) ?? '',
          expectedDate: dateInput(order.expectedDate),
          notes: order.notes,
          lines: order.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            materialId: line.materialId,
            poLineId: null,
            description: line.description,
            hsnCode: '',
            unit: line.unit,
            qty: String(line.qty),
            rate: String(line.rate),
            discount: '0',
            taxRatePercent: String(line.taxRatePercent),
          })),
        }}
      />
    </div>
  )
}
