import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listExpenseCategories } from '@/lib/queries/accounting'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { CategoriesManager } from './categories-manager'

export const metadata: Metadata = {
  title: 'Expense categories',
}

export default async function ExpenseCategoriesPage() {
  const user = await requireCapability('expense:read')
  const categories = await listExpenseCategories()

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Expense categories</Heading>
          <Text>How spending is grouped on the expenses screen.</Text>
        </div>
        <Button outline href="/expenses">
          Back to expenses
        </Button>
      </div>

      <CategoriesManager
        categories={categories}
        canManage={can(user.role, 'expense:update')}
      />
    </div>
  )
}
