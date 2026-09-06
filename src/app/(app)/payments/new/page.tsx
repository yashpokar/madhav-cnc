import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { openInvoiceBalances } from '@/lib/queries/payments'
import { listCustomersForPicker } from '@/lib/queries/accounting'
import { requireCapability } from '@/lib/session'
import { ReceiptForm } from '../receipt-form'

export const metadata: Metadata = {
  title: 'Record receipt',
}

export default async function NewReceiptPage({
  searchParams,
}: PageProps<'/payments/new'>) {
  await requireCapability('payment:create')
  const params = await searchParams

  const preset = typeof params.customer === 'string' ? params.customer : ''

  const [customers, invoices] = await Promise.all([
    listCustomersForPicker(),
    preset ? openInvoiceBalances(preset) : Promise.resolve([]),
  ])

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Record receipt</Heading>
        <Text>
          Take money against the customer&rsquo;s account, then split it across
          their open invoices. Anything left over stays as credit.
        </Text>
      </div>

      <ReceiptForm
        customers={customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: '',
        }))}
        initialCustomerId={preset}
        initialInvoices={invoices}
      />
    </div>
  )
}
