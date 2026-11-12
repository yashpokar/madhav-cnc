import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listCashCreditSources } from '@/lib/queries/accounting'
import { requireCapability } from '@/lib/session'
import { CreditForm } from './credit-form'

export const metadata: Metadata = {
  title: 'Add credit',
}

export default async function NewCreditPage() {
  await requireCapability('expense:create')
  const sources = await listCashCreditSources()

  return (
    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Add credit</Heading>
        <Text>
          Money received that is not a customer receipt, such as owner capital, a vendor refund or
          other income. Customer payments are recorded under Payments.
        </Text>
      </div>
      <CreditForm sources={sources} today={new Date().toISOString().slice(0, 10)} />
    </div>
  )
}
