import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { updateInvoice } from '@/lib/actions/invoices'
import { getInvoice } from '@/lib/queries/invoices'
import { requireCapability } from '@/lib/session'
import { InvoiceForm } from '../../invoice-form'

export const metadata: Metadata = {
  title: 'Edit invoice',
}

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null
}

export default async function EditInvoicePage({
  params,
}: PageProps<'/invoices/[id]/edit'>) {
  await requireCapability('invoice:update')
  const { id } = await params

  const invoice = await getInvoice(id)

  if (!invoice) {
    notFound()
  }

  if (invoice.status !== 'DRAFT') {
    return (
      <EmptyState
        title="This invoice can no longer be edited"
        description="An issued invoice is fixed. Move it back to draft first, or cancel it and raise a new one."
      />
    )
  }

  const action = updateInvoice.bind(null, invoice.id)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{invoice.number}</Heading>
        <Text>{invoice.customer.name}</Text>
      </div>

      <InvoiceForm
        action={action}
        submitLabel="Save changes"
        values={{
          customerId: invoice.customerId,
          customerName: invoice.customer.name,
          orderId: invoice.orderId,
          invoiceDate: dateInput(invoice.invoiceDate) ?? '',
          dueDate: dateInput(invoice.dueDate),
          placeOfSupply: invoice.placeOfSupply,
          isInterState: invoice.isInterState,
          billingAddress: invoice.billingAddress,
          customerGstin: invoice.customerGstin,
          discountType: invoice.discountType,
          discountValue: invoice.discountValue,
          transportCharge: invoice.transportCharge,
          transportTaxRatePercent: invoice.transportTaxRatePercent,
          advanceAdjusted: invoice.advanceAdjusted,
          notes: invoice.notes,
          terms: invoice.terms,
          lines: invoice.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            description: line.description,
            hsnCode: line.hsnCode,
            unit: line.unit,
            quantity: String(line.quantity),
            rate: String(line.rate),
            discountPercent: String(line.discountPercent),
            taxRatePercent: String(line.taxRatePercent),
          })),
        }}
      />
    </div>
  )
}
