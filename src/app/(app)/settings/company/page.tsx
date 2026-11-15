import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { getCompanySetting } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { CompanyForm } from './company-form'

export const metadata: Metadata = {
  title: 'Company details',
}

export default async function CompanySettingsPage() {
  await requireCapability('settings:update')
  const setting = await getCompanySetting()

  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Company details</Heading>
        <Text>
          Used on quotations, orders and invoices. Bank details and the UPI QR
          code are how customers pay you.
        </Text>
        <Text>
          <Link href="/settings/opening-balances" className="underline">
            Opening cash and bank balances
          </Link>{' '}
          are set on their own page.
        </Text>
      </div>

      <CompanyForm setting={setting} />
    </div>
  )
}
