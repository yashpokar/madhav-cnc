import type { Metadata } from 'next'
import { listPaymentModeOptions } from '@/lib/queries/payment-modes'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createOrder } from '@/lib/actions/orders'
import { listCustomerOptions, listItemOptions } from '@/lib/queries/quotations'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { isDayKey } from '@/lib/calendar'
import { getActiveIndustry } from '@/lib/queries/company'
import { OrderForm } from '../order-form'

export const metadata: Metadata = {
  title: 'New order',
}

export default async function NewOrderPage({ searchParams }: PageProps<'/orders/new'>) {
  await requireCapability('order:create')
  const query = await searchParams
  const requested = typeof query.startsAt === 'string' ? query.startsAt : ''
  const [requestedDay, requestedTime = ''] = requested.split('T')
  const startDate = isDayKey(requestedDay) ? requestedDay : ''
  const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime) ? requestedTime : ''
  const industry = await getActiveIndustry()

  const [customers, items, architects, carpenters] = await Promise.all([
    listCustomerOptions(),
    listItemOptions(),
    listPartnerOptions('ARCHITECT'),
    listPartnerOptions('CARPENTER'),
  ])

  const today = new Date().toISOString().slice(0, 10)

  const modes = await listPaymentModeOptions()

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New {industry.terms.order.toLowerCase()}</Heading>
        <Text>A number is assigned automatically when you save.</Text>
      </div>

      <OrderForm
        modes={modes}
        term={industry.terms.order}
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
          startDate,
          startTime,
          endDate: '',
          endTime: '',
          venue: null,
          headcount: null,
          siteAddress: null,
          siteCity: null,
          sitePincode: null,
          discountType: 'NONE',
          discountValue: 0,
          advanceAmount: 0,
          advanceChannelId: null,
          transportCharge: 0,
          transportTaxRatePercent: 0,
          notes: null,
          terms: null,
          lines: [],
        }}
      />
    </div>
  )
}
