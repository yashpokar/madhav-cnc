import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import {
  expenseSummary,
  listExpenseCategories,
  listExpenses,
} from '@/lib/queries/accounting'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Expenses',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function ExpensesPage({
  searchParams,
}: PageProps<'/expenses'>) {
  const user = await requireCapability('expense:read')
  const params = await searchParams

  const search = typeof params.q === 'string' ? params.q : undefined
  const categoryId =
    typeof params.category === 'string' && params.category !== 'all'
      ? params.category
      : undefined

  const [expenses, categories, summary] = await Promise.all([
    listExpenses({ search, categoryId }),
    listExpenseCategories(),
    expenseSummary(),
  ])

  const canCreate = can(user.role, 'expense:create')
  const spent = expenses.reduce((sum, expense) => sum + expense.total, 0)
  const credit = expenses
    .filter((expense) => expense.isInputCredit)
    .reduce((sum, expense) => sum + expense.taxAmount, 0)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Expenses</Heading>
          <Text>
            {currency.format(spent)} recorded
            {credit > 0
              ? ` · ${currency.format(credit)} input tax credit`
              : ''}
          </Text>
        </div>
        <div className="flex gap-3">
          <Button outline href="/expenses/categories">
            Categories
          </Button>
          {canCreate ? <Button href="/expenses/new">New expense</Button> : null}
        </div>
      </div>

      {summary.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {summary.slice(0, 8).map((row) => (
            <div
              key={row.categoryId ?? 'none'}
              className="rounded-lg bg-zinc-50 p-4 dark:bg-white/5"
            >
              <div className="truncate text-sm/5 text-zinc-500 dark:text-zinc-400">
                {row.name}
              </div>
              <div className="text-lg/7 font-semibold tabular-nums">
                {currency.format(row.total)}
              </div>
              <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                {row.count} entr{row.count === 1 ? 'y' : 'ies'}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {[{ id: 'all', name: 'All' }, ...categories].map((category) => {
            const isActive =
              (categoryId ?? 'all') === (category.id === 'all' ? 'all' : category.id)
            const query = new URLSearchParams()

            if (category.id !== 'all') query.set('category', category.id)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/expenses?${query.toString()}`
              : '/expenses'

            return (
              <Link
                key={category.id}
                href={href}
                className={
                  isActive
                    ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {category.name}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search payee, bill, note…" />
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No expenses yet'}
          description={
            search
              ? 'Try a different payee or bill number.'
              : 'Record purchases, rent, salaries and job-work bills here.'
          }
          action={
            canCreate && !search ? (
              <Button href="/expenses/new">New expense</Button>
            ) : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Number</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Paid to</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader>Mode</TableHeader>
              <TableHeader className="text-right">Tax</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id} href={`/expenses/${expense.id}`}>
                <TableCell className="font-mono text-xs">
                  {expense.number}
                  {expense.billNumber ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {expense.billNumber}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(expense.expenseDate)}
                </TableCell>
                <TableCell className="font-medium">
                  {expense.payeeName}
                  {expense.order ? (
                    <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {expense.order.number}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {expense.category ? (
                    <Badge color="zinc">{expense.category.name}</Badge>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {PAYMENT_MODE_LABELS[expense.paymentMode]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(expense.taxAmount)}
                  {expense.isInputCredit ? (
                    <div className="text-xs/5 text-lime-600 dark:text-lime-400">
                      ITC
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(expense.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
