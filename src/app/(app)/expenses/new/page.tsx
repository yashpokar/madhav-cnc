import type { Metadata } from 'next'
import { listPaymentModeOptions } from '@/lib/queries/payment-modes'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createExpense } from '@/lib/actions/expenses'
import {
  listExpenseCategories,
  listOrdersForPicker,
} from '@/lib/queries/accounting'
import { listVendorOptions } from '@/lib/queries/vendors'
import { todayIso } from '@/lib/form-defaults'
import { requireCapability } from '@/lib/session'
import { ExpenseForm } from '../expense-form'

export const metadata: Metadata = {
  title: 'New expense',
}

export default async function NewExpensePage() {
  await requireCapability('expense:create')

  const [categories, orders, vendors] = await Promise.all([
    listExpenseCategories(true),
    listOrdersForPicker(),
    listVendorOptions(),
  ])

  const modes = await listPaymentModeOptions()

  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New expense</Heading>
        <Text>Purchases, rent, salaries, job work and running costs.</Text>
      </div>

      <ExpenseForm
        modes={modes}
        action={createExpense}
        submitLabel="Save expense"
        categories={categories.map(({ id, name }) => ({ id, name }))}
        orders={orders}
        vendors={vendors}
        values={{
          categoryId: null,
          expenseDate: todayIso(),
          payeeName: '',
          description: null,
          amount: 0,
          taxRatePercent: 0,
          isInputCredit: false,
          vendorGstin: null,
          billNumber: null,
          channelId: null,
          reference: null,
          notes: null,
          orderId: null,
        }}
      />
    </div>
  )
}
