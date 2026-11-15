import type { Metadata } from 'next'
import { listPaymentModeOptions } from '@/lib/queries/payment-modes'
import { ActivityTimeline } from '@/components/activity-timeline'
import { LocalTime } from '@/components/local-time'
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
import { listVendorOptions } from '@/lib/queries/vendors'
import { requireCapability } from '@/lib/session'
import { methodFor, readStoredDetails } from '@/lib/payment-methods'
import { ExpenseForm } from '../expense-form'
import { DeleteExpense } from './delete-expense'

export const metadata: Metadata = {
  title: 'Expense',
}

export default async function ExpensePage({
  params,
}: PageProps<'/expenses/[id]'>) {
  const user = await requireCapability('expense:update')
  const { id } = await params

  const [expense, categories, orders, vendors] = await Promise.all([
    getExpense(id),
    listExpenseCategories(),
    listOrdersForPicker(),
    listVendorOptions(),
  ])

  if (!expense) {
    notFound()
  }

  const action = updateExpense.bind(null, expense.id)

  const modes = await listPaymentModeOptions(expense.channelId)

  // Older entries only have a free reference: offer it as the method's main field.
  const primary = methodFor(expense.paymentMode)?.primary
  const storedDetails = readStoredDetails(expense.paymentMode, expense.paymentDetails)

  if (primary && expense.reference && !storedDetails[primary]) storedDetails[primary] = expense.reference

  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{expense.number}</Heading>
        <Text>
          Recorded <LocalTime value={expense.createdAt} />
          {expense.createdBy ? ` by ${expense.createdBy.name}` : ''}
        </Text>
      </div>

      <ExpenseForm
        modes={modes}
        action={action}
        submitLabel="Save changes"
        categories={categories.map(({ id: categoryId, name }) => ({
          id: categoryId,
          name,
        }))}
        orders={orders}
        vendors={vendors}
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
          channelId: expense.channelId,
          reference: expense.reference,
          paymentDetails: storedDetails,
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

      <ActivityTimeline entity="expense" id={expense.id} />
    </div>
  )
}
