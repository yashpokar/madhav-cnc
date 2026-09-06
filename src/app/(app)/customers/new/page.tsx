import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createCustomer } from '@/lib/actions/customers'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { CustomerForm } from '../customer-form'

export const metadata: Metadata = {
  title: 'Add customer',
}

export default async function NewCustomerPage() {
  await requireCapability('customer:create')

  const [architects, carpenters] = await Promise.all([
    listPartnerOptions('ARCHITECT'),
    listPartnerOptions('CARPENTER'),
  ])

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Add customer</Heading>
        <Text>A code is assigned automatically when you save.</Text>
      </div>

      <CustomerForm
        action={createCustomer}
        submitLabel="Save customer"
        architects={architects}
        carpenters={carpenters}
        values={{
          name: '',
          type: 'INDIVIDUAL',
          status: 'ACTIVE',
          phone: '',
          altPhone: null,
          email: null,
          address: null,
          city: null,
          state: null,
          pincode: null,
          gstin: null,
          pan: null,
          dateOfBirth: null,
          anniversaryDate: null,
          preferredArchitectId: null,
          preferredCarpenterId: null,
          paymentTermsDays: null,
          notes: null,
        }}
      />
    </div>
  )
}
