import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createQuotation } from '@/lib/actions/quotations'
import { listCustomerOptions, listItemOptions } from '@/lib/queries/quotations'
import { listPartnerOptions } from '@/lib/queries/partners'
import { getDefaultAdvancePercent } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { QuotationForm } from '../quotation-form'

export const metadata: Metadata = {
  title: 'New quotation',
}

export default async function NewQuotationPage() {
  await requireCapability('quotation:create')

  const [customers, items, architects, carpenters, advancePercent] =
    await Promise.all([
      listCustomerOptions(),
      listItemOptions(),
      listPartnerOptions('ARCHITECT'),
      listPartnerOptions('CARPENTER'),
      getDefaultAdvancePercent(),
    ])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New quotation</Heading>
        <Text>A number is assigned automatically when you save.</Text>
      </div>

      <QuotationForm
        action={createQuotation}
        submitLabel="Save quotation"
        customers={customers}
        items={items}
        architects={architects}
        carpenters={carpenters}
        values={{
          customerId: null,
          architectId: null,
          carpenterId: null,
          materialSupply: 'WITH_MATERIAL',
          subject: null,
          quotationDate: today,
          validUntil: null,
          siteAddress: null,
          siteCity: null,
          sitePincode: null,
          discountType: 'NONE',
          discountValue: 0,
          advancePercent,
          notes: null,
          terms: null,
          lines: [],
        }}
      />
    </div>
  )
}
