import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CustomerRelated } from '@/components/related-sections'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateCustomer } from '@/lib/actions/customers'
import { getCustomer } from '@/lib/queries/customers'
import { listPartnerOptions } from '@/lib/queries/partners'
import { ConfirmButton } from '@/components/confirm-button'
import { DangerZone } from '@/components/danger-zone'
import { deleteCustomer } from '@/lib/actions/customers'
import { can } from '@/lib/permissions'
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
  const user = await requireCapability('customer:update')
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
        <nav aria-label="Customer records" className="flex flex-wrap gap-2 pt-1">
          {can(user.role, 'invoice:read') ? (
            <Button outline href={`/customers/${customer.id}/statement`}>
              Statement
            </Button>
          ) : null}
          {can(user.role, 'quotation:read') ? (
            <Button outline href={`/quotations?q=${encodeURIComponent(customer.name)}`}>
              Quotations
            </Button>
          ) : null}
          {can(user.role, 'order:read') ? (
            <Button outline href={`/orders?q=${encodeURIComponent(customer.name)}`}>
              Orders
            </Button>
          ) : null}
          {can(user.role, 'invoice:read') ? (
            <Button outline href={`/invoices?q=${encodeURIComponent(customer.name)}`}>
              Invoices
            </Button>
          ) : null}
          {can(user.role, 'quotation:create') ? (
            <Button href={`/quotations/new?customer=${customer.id}`}>
              New quotation
            </Button>
          ) : null}
        </nav>
      </div>

      <CustomerRelated id={customer.id} name={customer.name} role={user.role} />

      <h2 className="text-sm/6 font-semibold text-zinc-950 dark:text-white">Customer details</h2>

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

      {can(user.role, 'customer:delete') ? (
        <DangerZone
          title="Delete customer"
          description="Only possible while there are no quotations, orders, invoices or receipts. Otherwise set the status to Inactive."
        >
          <ConfirmButton
            label="Delete"
            title={`Delete ${customer.name}?`}
            description="This permanently removes the customer. This cannot be undone."
            confirmLabel="Delete customer"
            redirectTo="/customers"
            action={deleteCustomer.bind(null, customer.id)}
          />
        </DangerZone>
      ) : null}
    </div>
  )
}
