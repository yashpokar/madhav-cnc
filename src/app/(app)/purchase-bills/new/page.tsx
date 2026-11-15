import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createBill } from '@/lib/actions/purchase-bills'
import {
  listPurchasableOptions,
  listPurchaseVendorOptions,
} from '@/lib/queries/purchases'
import { requireCapability } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { defaultDueDate, suggestInterState, todayIso } from '@/lib/purchase-rules'
import { emptyPurchaseLine } from '@/components/purchase-line-editor'
import { BillForm } from '../bill-form'

export const metadata: Metadata = {
  title: 'New purchase bill',
}

export default async function NewBillPage({
  searchParams,
}: PageProps<'/purchase-bills/new'>) {
  await requireCapability('purchase:create')
  const params = await searchParams
  const vendorParam = typeof params.vendor === 'string' ? params.vendor : null

  const [vendors, options, company] = await Promise.all([
    listPurchaseVendorOptions(),
    listPurchasableOptions(),
    prisma.companySetting.findUnique({
      where: { id: await requireCompanyId() },
      select: { gstin: true },
    }),
  ])

  const vendor = vendorParam ? vendors.find((row) => row.id === vendorParam) : undefined
  const today = todayIso()

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New purchase bill</Heading>
        <Text>Record what a vendor has billed you. Post it once it is checked.</Text>
      </div>

      <BillForm
        action={createBill}
        submitLabel="Save bill"
        isNew
        vendors={vendors}
        options={options}
        values={{
          vendorId: vendor?.id ?? '',
          vendorName: vendor?.name ?? '',
          vendorGstin: vendor?.gstin ?? null,
          poId: null,
          vendorBillNumber: null,
          billDate: today,
          dueDate: defaultDueDate(today, null),
          isInterState: suggestInterState(company?.gstin ?? null, vendor?.gstin ?? null),
          notes: null,
          lines: [emptyPurchaseLine()],
        }}
      />
    </div>
  )
}
