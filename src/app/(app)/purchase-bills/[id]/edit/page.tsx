import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { updateBill } from '@/lib/actions/purchase-bills'
import {
  getBill,
  listPurchasableOptions,
  listPurchaseVendorOptions,
} from '@/lib/queries/purchases'
import { requireCapability } from '@/lib/session'
import { BillForm } from '../../bill-form'

export const metadata: Metadata = {
  title: 'Edit purchase bill',
}

const dateInput = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

export default async function EditBillPage({
  params,
}: PageProps<'/purchase-bills/[id]/edit'>) {
  await requireCapability('purchase:update')
  const { id } = await params

  const bill = await getBill(id)

  if (!bill) notFound()

  if (bill.status !== 'DRAFT') {
    return (
      <EmptyState
        title="This bill can no longer be edited"
        description="A posted bill is locked. Move it back to draft first, or cancel it and record a new one."
      />
    )
  }

  const [vendors, options] = await Promise.all([
    listPurchaseVendorOptions(),
    listPurchasableOptions(),
  ])

  // An inactive vendor is not in the picker, but this bill still names it.
  const vendorList = vendors.some((row) => row.id === bill.vendorId)
    ? vendors
    : [
        ...vendors,
        { id: bill.vendor.id, name: bill.vendor.name, gstin: bill.vendor.gstin, detail: '' },
      ]

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{bill.number}</Heading>
        <Text>{bill.vendor.name}</Text>
      </div>

      <BillForm
        action={updateBill.bind(null, bill.id)}
        submitLabel="Save changes"
        isNew={false}
        vendors={vendorList}
        options={options}
        values={{
          vendorId: bill.vendorId,
          vendorName: bill.vendor.name,
          vendorGstin: bill.vendor.gstin,
          poId: bill.poId,
          vendorBillNumber: bill.vendorBillNumber,
          billDate: dateInput(bill.billDate) ?? '',
          dueDate: dateInput(bill.dueDate),
          isInterState: bill.isInterState,
          notes: bill.notes,
          lines: bill.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            materialId: line.materialId,
            poLineId: line.poLineId,
            description: line.description,
            hsnCode: line.hsnCode ?? '',
            unit: line.unit,
            qty: String(line.qty),
            rate: String(line.rate),
            discount: String(line.discount),
            taxRatePercent: String(line.taxRatePercent),
          })),
        }}
      />
    </div>
  )
}
