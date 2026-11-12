import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listExpenseVendors } from '@/lib/queries/accounting'
import { requireCapability } from '@/lib/session'
import { LiteExpenseForm } from './lite-expense-form'

export const metadata: Metadata = {
  title: 'Quick expense',
}

export default async function NewLiteExpensePage() {
  await requireCapability('expense:create')
  const vendors = await listExpenseVendors()

  return (
    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Quick expense</Heading>
          <Text>Vendor, amount and how it was paid. Nothing else.</Text>
        </div>
        <Button outline href="/expenses/new">
          Full form
        </Button>
      </div>

      <LiteExpenseForm vendors={vendors} today={new Date().toISOString().slice(0, 10)} />
    </div>
  )
}
