import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Divider } from '@/components/catalyst/divider'
import { Text } from '@/components/catalyst/text'
import { updateExpense } from '@/lib/actions/expenses'
import {
  getExpense,
  listExpenseCategories,
  listOrdersForPicker,
} from '@/lib/queries/accounting'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ExpenseForm } from '../expense-form'
import { DeleteExpense } from './delete-expense'

export const metadata: Metadata = {
  title: 'Expense',
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function ExpensePage({
  params,
}: PageProps<'/expenses/[id]'>) {
  const user = await requireCapability('expense:update')
  const { id } = await params

  const [expense, categories, orders] = await Promise.all([
    getExpense(id),
    listExpenseCategories(),
    listOrdersForPicker(),
  ])

  if (!expense) {
    notFound()
  }

  const action = updateExpense.bind(null, expense.id)

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{expense.number}</Heading>
        <Text>
          Recorded {dateFormat.format(expense.createdAt)}
          {expense.createdBy ? ` by ${expense.createdBy.name}` : ''}
        </Text>
      </div>

      <ExpenseForm
        action={action}
        submitLabel="Save changes"
        categories={categories.map(({ id: categoryId, name }) => ({
          id: categoryId,
          name,
        }))}
        orders={orders}
        values={{
          categoryId: expense.categoryId,
          expenseDate: expense.expenseDate.toISOString().slice(0, 10),
          payeeName: expense.payeeName,
          description: expense.description,
          amount: expense.amount,
          taxRatePercent: expense.taxRatePercent,
          isInputCredit: expense.isInputCredit,
          vendorGstin: expense.vendorGstin,
          billNumber: expense.billNumber,
          paymentMode: expense.paymentMode,
          reference: expense.reference,
          notes: expense.notes,
          orderId: expense.orderId,
        }}
      />

      {can(user.role, 'expense:delete') ? (
        <>
          <Divider />
          <DeleteExpense id={expense.id} />
        </>
      ) : null}
    </div>
  )
}
