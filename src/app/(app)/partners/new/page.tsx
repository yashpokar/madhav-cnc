import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createPartner } from '@/lib/actions/partners'
import { requireCapability } from '@/lib/session'
import { PartnerType } from '@/generated/prisma/enums'
import { PartnerForm } from '../partner-form'

export const metadata: Metadata = {
  title: 'Add partner',
}

export default async function NewPartnerPage({
  searchParams,
}: PageProps<'/partners/new'>) {
  await requireCapability('partner:create')
  const params = await searchParams
  const requested = typeof params.type === 'string' ? params.type : undefined
  const type: PartnerType =
    requested === 'CARPENTER' ? 'CARPENTER' : 'ARCHITECT'

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Add partner</Heading>
        <Text>Architects and carpenters who refer customers to you.</Text>
      </div>

      <PartnerForm
        action={createPartner}
        submitLabel="Save partner"
        values={{
          type,
          name: '',
          firmName: null,
          phone: '',
          altPhone: null,
          email: null,
          address: null,
          city: null,
          state: null,
          pincode: null,
          isActive: true,
          notes: null,
        }}
      />
    </div>
  )
}
