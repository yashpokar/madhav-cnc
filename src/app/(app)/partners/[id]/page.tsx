import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updatePartner } from '@/lib/actions/partners'
import { getPartner } from '@/lib/queries/partners'
import { requireCapability } from '@/lib/session'
import { PartnerForm } from '../partner-form'

export const metadata: Metadata = {
  title: 'Edit partner',
}

export default async function EditPartnerPage({
  params,
}: PageProps<'/partners/[id]'>) {
  await requireCapability('partner:update')
  const { id } = await params
  const partner = await getPartner(id)

  if (!partner) {
    notFound()
  }

  const action = updatePartner.bind(null, partner.id)

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{partner.name}</Heading>
        <Text>
          {partner.code} ·{' '}
          {partner.type === 'ARCHITECT' ? 'Architect' : 'Carpenter'}
        </Text>
      </div>

      <PartnerForm
        action={action}
        submitLabel="Save changes"
        lockType
        values={{
          id: partner.id,
          type: partner.type,
          name: partner.name,
          firmName: partner.firmName,
          phone: partner.phone,
          altPhone: partner.altPhone,
          email: partner.email,
          address: partner.address,
          city: partner.city,
          state: partner.state,
          pincode: partner.pincode,
          isActive: partner.isActive,
          notes: partner.notes,
        }}
      />
    </div>
  )
}
