import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { OverallStatement } from '@/components/overall-statement'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Order statement',
}

export default async function StatementPage({ searchParams }: PageProps<'/statement'>) {
  const user = await requireCapability('order:read')
  const params = await searchParams

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Order statement</Heading>
        <Text>Every order with what was billed, received and is still due.</Text>
      </div>
      <OverallStatement params={params} showMoney={can(user.role, 'invoice:read')} />
    </div>
  )
}
