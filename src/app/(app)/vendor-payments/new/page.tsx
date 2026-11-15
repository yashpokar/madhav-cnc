import type { Metadata } from 'next'
import { listPaymentModeOptions } from '@/lib/queries/payment-modes'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import {
  listVendorsForPicker,
  openBillBalances,
  openingPayableFor,
} from '@/lib/queries/vendor-payments'
import { requireCapability } from '@/lib/session'
import { PaymentForm } from '../payment-form'

export const metadata: Metadata = {
  title: 'Record vendor payment',
}

export default async function NewVendorPaymentPage({
  searchParams,
}: PageProps<'/vendor-payments/new'>) {
  await requireCapability('purchase:update')
  const params = await searchParams

  const vendor = typeof params.vendor === 'string' ? params.vendor : ''
  const bill = typeof params.bill === 'string' ? params.bill : ''
  const amount = typeof params.amount === 'string' ? Number(params.amount) : 0

  const [vendors, bills, opening, modes] = await Promise.all([
    listVendorsForPicker(),
    vendor ? openBillBalances(vendor) : Promise.resolve([]),
    vendor ? openingPayableFor(vendor) : Promise.resolve(null),
    listPaymentModeOptions(),
  ])

  // A link may name a vendor that does not exist (or is another company's).
  const known = vendors.some((row) => row.id === vendor)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Record vendor payment</Heading>
        <Text>
          Pay a vendor, then split the amount across their open bills. Anything left over is kept
          as an advance to the vendor.
        </Text>
      </div>

      <PaymentForm
        modes={modes}
        vendors={vendors}
        initialVendorId={known ? vendor : ''}
        initialBills={known ? bills : []}
        initialOpeningLeft={known ? (opening?.remaining ?? 0) : 0}
        initialOpeningAsOf={known ? (opening?.asOf ?? null) : null}
        initialAmount={Number.isFinite(amount) && amount > 0 ? amount : 0}
        initialBillId={bill}
      />
    </div>
  )
}
