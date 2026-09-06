import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createExpense } from '@/lib/actions/expenses'
import {
  listExpenseCategories,
  listOrdersForPicker,
} from '@/lib/queries/accounting'
import { requireCapability } from '@/lib/session'
import { ExpenseForm } from '../expense-form'

export const metadata: Metadata = {
  title: 'New expense',
}

export default async function NewExpensePage() {
  await requireCapability('expense:create')

  const [categories, orders] = await Promise.all([
    listExpenseCategories(true),
    listOrdersForPicker(),
  ])

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New expense</Heading>
        <Text>Purchases, rent, salaries, job work and running costs.</Text>
      </div>

      <ExpenseForm
        action={createExpense}
        submitLabel="Save expense"
        categories={categories.map(({ id, name }) => ({ id, name }))}
        orders={orders}
        values={{
          categoryId: null,
          expenseDate: new Date().toISOString().slice(0, 10),
          payeeName: '',
          description: null,
          amount: 0,
          taxRatePercent: 18,
          isInputCredit: false,
          vendorGstin: null,
          billNumber: null,
          paymentMode: 'BANK_TRANSFER',
          reference: null,
          notes: null,
          orderId: null,
        }}
      />
    </div>
  )
}
