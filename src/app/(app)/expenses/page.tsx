import { date as dateFormat, moneyWhole as currency } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls, readDateRange, readListControls } from '@/lib/list-controls'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { RowActions } from '@/components/row-actions'
import { deleteExpense } from '@/lib/actions/expenses'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { ExportButton } from '@/components/export-button'
import { Heading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState, FormBanner } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import {
  expenseSummary,
  listExpenseCategories,
  listExpenses,
} from '@/lib/queries/accounting'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { PaymentMode } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Expenses',
}

export default async function ExpensesPage({
  searchParams,
}: PageProps<'/expenses'>) {
  const user = await requireCapability('expense:read')
  const params = await searchParams

  const search = typeof params.q === 'string' ? params.q : undefined
  const created = typeof params.created === 'string' ? params.created : undefined
  const categoryId =
    typeof params.category === 'string' && params.category !== 'all'
      ? params.category
      : undefined

  const modeParam = typeof params.mode === 'string' ? params.mode : undefined
  const mode = Object.values(PaymentMode).find((value) => value === modeParam)

  const [expenses, categories, summary] = await Promise.all([
    listExpenses({ search, categoryId }),
    listExpenseCategories(),
    expenseSummary(),
  ])

  const canCreate = can(user.role, 'expense:create')
  const canEdit = can(user.role, 'expense:update')
  const canDelete = can(user.role, 'expense:delete')
  const spent = expenses.reduce((sum, expense) => sum + expense.total, 0)
  const credit = expenses
    .filter((expense) => expense.isInputCredit)
    .reduce((sum, expense) => sum + expense.taxAmount, 0)

  const everything = summary.reduce((sum, row) => sum + row.count, 0)
  const { min, max } = readListControls(params)
  const { from, to } = readDateRange(params)
  const filtered = Boolean(
    search ||
      categoryId ||
      mode ||
      min !== undefined ||
      max !== undefined ||
      from ||
      to,
  )
  const clearHref = (() => {
    const keep = new URLSearchParams()
    for (const key of ['sort', 'dir', 'size']) {
      const value = params[key]
      if (typeof value === 'string') keep.set(key, value)
    }
    return keep.toString() ? `/expenses?${keep}` : '/expenses'
  })()

  const matching = applyListControls(
    mode ? expenses.filter((row) => row.paymentMode === mode) : expenses,
    params,
    {
      date: (row) => row.expenseDate,
      amount: (row) => row.total,
    },
  )
  const sorted = sortRows(matching, params, {
    number: (row) => row.number,
    date: (row) => row.expenseDate,
    payee: (row) => row.payeeName,
    category: (row) => row.category?.name,
    mode: (row) => modeText(row),
    tax: (row) => row.taxAmount,
    total: (row) => row.total,
  })
  const paged = paginate(sorted, params)

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
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="expenses" search={search} />
          <Button outline href="/expenses/categories">
            Categories
          </Button>
          {canCreate ? <Button href="/expenses/new">New expense</Button> : null}
        </div>
      </div>

      {created ? (
        <FormBanner
          tone="success"
          steps={canCreate ? [{ label: 'Add another expense', href: '/expenses/new' }] : undefined}
        >
          Expense {created} saved
        </FormBanner>
      ) : null}

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

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search number, payee, bill, note…" />
        <FilterSelect
          param="category"
          label="Category"
          allLabel="All"
          value={categoryId}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          param="mode"
          label="Payment mode"
          allLabel="All"
          value={mode}
          options={Object.values(PaymentMode).map((value) => ({
            value,
            label: PAYMENT_MODE_LABELS[value],
          }))}
        />
        <ListControls
          ceiling={amountCeiling(expenses, (row) => row.total)}
          params={params}
          pathname="/expenses"
          amountLabel="Total"
        />
      </div>

      {sorted.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No matches"
            description="No expenses fit the current search and filters."
            action={
              <Button outline href={clearHref}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No expenses yet"
            description="Record purchases, rent, salaries and job-work bills here."
            action={canCreate ? <Button href="/expenses/new">New expense</Button> : null}
          />
        )
      ) : (
<>
        {filtered ? (
          <p className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
            {sorted.length} of {everything} expense{everything === 1 ? '' : 's'}
          </p>
        ) : null}
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Number" params={params} pathname="/expenses" />
              <SortHeader column="date" label="Date" params={params} pathname="/expenses" />
              <SortHeader column="payee" label="Paid to" params={params} pathname="/expenses" />
              <SortHeader column="category" label="Category" params={params} pathname="/expenses" />
              <SortHeader column="mode" label="Mode" params={params} pathname="/expenses" />
              <SortHeader column="tax" label="Tax" params={params} pathname="/expenses" align="right" />
              <SortHeader column="total" label="Total" params={params} pathname="/expenses" align="right" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((expense) => (
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
                  {modeText(expense)}
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
              <TableCell>
                  <RowActions
                    name={expense.number}
                    
                    editHref={canEdit && (true) ? `/expenses/${expense.id}` : undefined}
                    deleteAction={
                      canDelete && (true)
                        ? deleteExpense.bind(null, expense.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${expense.number}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/expenses" />
</>
      )}
    </div>
  )
}
