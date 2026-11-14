import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createVendor } from '@/lib/actions/vendors'
import { requireCapability } from '@/lib/session'
import { VendorForm } from '../vendor-form'

export const metadata: Metadata = {
  title: 'Add vendor',
}

export default async function NewVendorPage() {
  await requireCapability('expense:create')

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Add vendor</Heading>
        <Text>Someone you pay: a supplier, contractor or utility.</Text>
      </div>

      <VendorForm
        action={createVendor}
        submitLabel="Save vendor"
        values={{
          name: '',
          contactName: null,
          phone: null,
          email: null,
          gstin: null,
          address: null,
          city: null,
          description: null,
          isActive: true,
        }}
      />
    </div>
  )
}
