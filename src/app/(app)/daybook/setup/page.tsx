import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listBankAccounts, listDenominations } from '@/lib/queries/daybook'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { TallySetup } from './tally-setup'

export const metadata: Metadata = {
  title: 'Day book setup',
}

export default async function DayBookSetupPage() {
  const user = await requireCapability('expense:update')
  const [banks, notes] = await Promise.all([listBankAccounts(), listDenominations()])

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Day book setup</Heading>
          <Text>
            The bank accounts and note denominations shown in the counting area under each day.
            Hiding one keeps its past counts; deleting one removes them.
          </Text>
        </div>
        <Button outline href="/daybook">
          Back to day book
        </Button>
      </div>

      <TallySetup banks={banks} notes={notes} canDelete={can(user.role, 'expense:delete')} />
    </div>
  )
}
