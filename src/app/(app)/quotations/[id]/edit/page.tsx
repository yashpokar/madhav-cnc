import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateQuotation } from '@/lib/actions/quotations'
import {
  getQuotation,
  listCustomerOptions,
  listItemOptions,
} from '@/lib/queries/quotations'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { QuotationForm } from '../../quotation-form'

export const metadata: Metadata = {
  title: 'Edit quotation',
}

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null
}

export default async function EditQuotationPage({
  params,
}: PageProps<'/quotations/[id]/edit'>) {
  await requireCapability('quotation:update')
  const { id } = await params

  const [quotation, customers, items, architects, carpenters] =
    await Promise.all([
      getQuotation(id),
      listCustomerOptions(),
      listItemOptions(),
      listPartnerOptions('ARCHITECT'),
      listPartnerOptions('CARPENTER'),
    ])

  if (!quotation) {
    notFound()
  }

  const action = updateQuotation.bind(null, quotation.id)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>
          {quotation.number}
          {quotation.revision > 1 ? ` R${quotation.revision}` : ''}
        </Heading>
        <Text>{quotation.customer.name}</Text>
      </div>

      <QuotationForm
        action={action}
        submitLabel="Save changes"
        customers={customers}
        items={items}
        architects={architects}
        carpenters={carpenters}
        values={{
          customerId: quotation.customerId,
          architectId: quotation.architectId,
          carpenterId: quotation.carpenterId,
          materialSupply: quotation.materialSupply,
          subject: quotation.subject,
          quotationDate: dateInput(quotation.quotationDate) ?? '',
          validUntil: dateInput(quotation.validUntil),
          siteAddress: quotation.siteAddress,
          siteCity: quotation.siteCity,
          sitePincode: quotation.sitePincode,
          discountType: quotation.discountType,
          discountValue: quotation.discountValue,
          advancePercent: quotation.advancePercent,
          notes: quotation.notes,
          terms: quotation.terms,
          lines: quotation.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            description: line.description,
            unit: line.unit,
            materialSupply: line.materialSupply,
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
