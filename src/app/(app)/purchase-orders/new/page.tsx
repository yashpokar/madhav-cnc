import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createOrder } from '@/lib/actions/purchase-orders'
import {
  listPurchasableOptions,
  listPurchaseVendorOptions,
} from '@/lib/queries/purchases'
import { requireCapability } from '@/lib/session'
import { todayIso } from '@/lib/purchase-rules'
import { emptyPurchaseLine } from '@/components/purchase-line-editor'
import { OrderForm } from '../order-form'

export const metadata: Metadata = {
  title: 'New purchase order',
}

export default async function NewOrderPage({
  searchParams,
}: PageProps<'/purchase-orders/new'>) {
  await requireCapability('purchase:create')
  const params = await searchParams
  const vendorParam = typeof params.vendor === 'string' ? params.vendor : null

  const [vendors, options] = await Promise.all([
    listPurchaseVendorOptions(),
    listPurchasableOptions(),
  ])
  const vendor = vendorParam ? vendors.find((row) => row.id === vendorParam) : undefined

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New purchase order</Heading>
        <Text>What you are asking a vendor to supply. Send it to them once it is ready.</Text>
      </div>

      <OrderForm
        action={createOrder}
        submitLabel="Save order"
        vendors={vendors}
        options={options}
        values={{
          vendorId: vendor?.id ?? '',
          vendorName: vendor?.name ?? '',
          orderDate: todayIso(),
          expectedDate: null,
          notes: null,
          lines: [emptyPurchaseLine()],
        }}
      />
    </div>
  )
}
