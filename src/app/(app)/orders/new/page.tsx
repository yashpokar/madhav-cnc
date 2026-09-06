import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createOrder } from '@/lib/actions/orders'
import { listCustomerOptions, listItemOptions } from '@/lib/queries/quotations'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { OrderForm } from '../order-form'

export const metadata: Metadata = {
  title: 'New order',
}

export default async function NewOrderPage() {
  await requireCapability('order:create')

  const [customers, items, architects, carpenters] = await Promise.all([
    listCustomerOptions(),
    listItemOptions(),
    listPartnerOptions('ARCHITECT'),
    listPartnerOptions('CARPENTER'),
  ])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New order</Heading>
        <Text>A number is assigned automatically when you save.</Text>
      </div>

      <OrderForm
        action={createOrder}
        submitLabel="Save order"
        customers={customers}
        items={items}
        architects={architects}
        carpenters={carpenters}
        values={{
          customerId: null,
          architectId: null,
          carpenterId: null,
          subject: null,
          customerPoNumber: null,
          orderDate: today,
          dueDate: null,
          siteAddress: null,
          siteCity: null,
          sitePincode: null,
          discountType: 'NONE',
          discountValue: 0,
          advanceAmount: 0,
          transportCharge: 0,
          transportTaxRatePercent: 18,
          notes: null,
          terms: null,
          lines: [],
        }}
      />
    </div>
  )
}
