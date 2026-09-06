import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateCustomer } from '@/lib/actions/customers'
import { getCustomer } from '@/lib/queries/customers'
import { listPartnerOptions } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { CustomerForm } from '../customer-form'

export const metadata: Metadata = {
  title: 'Edit customer',
}

function toDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null
}

export default async function EditCustomerPage({
  params,
}: PageProps<'/customers/[id]'>) {
  await requireCapability('customer:update')
  const { id } = await params

  const [customer, architects, carpenters] = await Promise.all([
    getCustomer(id),
    listPartnerOptions('ARCHITECT'),
    listPartnerOptions('CARPENTER'),
  ])

  if (!customer) {
    notFound()
  }

  const action = updateCustomer.bind(null, customer.id)

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{customer.name}</Heading>
        <Text>
          {customer.code}
          {customer.createdBy ? ` · added by ${customer.createdBy.name}` : ''}
        </Text>
      </div>

      <CustomerForm
        action={action}
        submitLabel="Save changes"
        architects={architects}
        carpenters={carpenters}
        values={{
          name: customer.name,
          type: customer.type,
          status: customer.status,
          phone: customer.phone,
          altPhone: customer.altPhone,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          pincode: customer.pincode,
          gstin: customer.gstin,
          pan: customer.pan,
          dateOfBirth: toDateInput(customer.dateOfBirth),
          anniversaryDate: toDateInput(customer.anniversaryDate),
          preferredArchitectId: customer.preferredArchitectId,
          preferredCarpenterId: customer.preferredCarpenterId,
          paymentTermsDays: customer.paymentTermsDays,
          notes: customer.notes,
        }}
      />
    </div>
  )
}
