import { date as dateFormat, money as currency } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import { RowActions } from '@/components/row-actions'
import { deleteReceipt } from '@/lib/actions/payments'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import { Heading, Subheading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { DateRangeFilter } from '@/components/date-range-filter'
import { RangeSlider } from '@/components/range-slider'
import { amountCeiling, inDateRange, readDateRange, readListControls } from '@/lib/list-controls'
import { EmptyState } from '@/components/form-banner'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { PrintButton } from '@/components/print-button'
import { DocumentLetterhead } from '@/components/document-letterhead'
import { customerAccount } from '@/lib/queries/payments'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ADJUSTMENT_REASON_LABELS, NOTE_REASON_LABELS } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Customer statement',
}

export default async function CustomerStatementPage({
  params,
  searchParams,
}: PageProps<'/customers/[id]/statement'>) {
  const user = await requireCapability('payment:read')
  const { id } = await params
  const query = await searchParams

  const [account, company] = await Promise.all([
    customerAccount(id),
    getCompanySetting(),
  ])

  if (!account) {
    notFound()
  }

  const { from, to } = readDateRange(query)
  const { min, max } = readListControls(query)
  const matching = account.receipts.filter(
    (receipt) =>
      inDateRange(receipt.paidOn, query) &&
      (min === undefined || receipt.amount >= min) &&
      (max === undefined || receipt.amount <= max),
  )
  const receipts = sortRows(matching, query, {
    receipt: (row) => row.number,
    date: (row) => row.paidOn,
    mode: (row) => modeText(row),
    reference: (row) => row.reference,
    amount: (row) => row.amount,
    applied: (row) => row.allocated + row.openingApplied,
    onaccount: (row) => row.unallocated,
  })
  const filtered =
    from !== undefined || to !== undefined || min !== undefined || max !== undefined
  const pathname = `/customers/${id}/statement`
  const sortParams = query
  const sortKeep = (['sort', 'dir'] as const).flatMap((key) => {
    const value = query[key]
    const single = Array.isArray(value) ? value[0] : value

    return single ? [[key, single] as const] : []
  })

  const owing = account.net > 0
  const settled = Math.abs(account.net) < 0.005

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <Heading>{account.customer.name}</Heading>
          <Text>
            Statement of account
            {account.customer.phone ? ` · ${account.customer.phone}` : ''}
          </Text>
        </div>
        <div className="flex gap-3">
          <PrintButton label="Print statement" />
          <Button outline href={`/customers/${account.customer.id}`}>
            Edit customer
          </Button>
          {can(user.role, 'payment:create') ? (
            <Button href={`/payments/new?customer=${account.customer.id}`}>
              Record receipt
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentLetterhead
        company={company}
        title="Statement of account"
        reference={account.customer.name}
        date={new Date()}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            Open bills
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.invoiceDue)}
          </div>
          {account.opening > 0 ? (
            <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
              + {currency.format(account.opening)} opening balance
            </div>
          ) : null}
          {account.adjustmentDebit > 0 ? (
            <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
              + {currency.format(account.adjustmentDebit)} balance adjustments
            </div>
          ) : null}
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            On account
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.onAccount)}
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            {account.adjustmentCredit > 0 ? 'Credits' : 'Credit notes'}
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.credit)}
          </div>
          {account.adjustmentCredit > 0 ? (
            <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
              incl. {currency.format(account.adjustmentCredit)} balance adjustments
            </div>
          ) : null}
        </div>
        <div
          className={
            owing
              ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
              : settled
                ? 'surface-card p-4'
                : 'rounded-lg bg-lime-50 p-4 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:ring-lime-400/20'
          }
        >
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            {owing ? 'Customer owes' : settled ? 'Settled' : 'In credit'}
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(Math.abs(account.net))}
          </div>
        </div>
      </div>

      <Divider />

      <div>
        <Subheading level={2}>Open invoices</Subheading>
        <div className="mt-4">
          {account.invoices.length === 0 && account.opening <= 0 && account.adjustmentDebit <= 0 ? (
            <EmptyState
              title="No open invoices"
              description="Everything billed to this customer is settled."
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Invoice</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Due</TableHeader>
                  <TableHeader className="text-right">Total</TableHeader>
                  <TableHeader className="text-right">Received</TableHeader>
                  <TableHeader className="text-right">Balance</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.invoices.map((invoice) => (
                  <TableRow key={invoice.id} href={`/invoices/${invoice.id}`}>
                    <TableCell className="font-mono text-xs">
                      {invoice.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(invoice.invoiceDate)}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {invoice.dueDate
                        ? dateFormat.format(invoice.dueDate)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(invoice.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(invoice.paid)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(invoice.due)}
                    </TableCell>
                  </TableRow>
                ))}
                {account.opening > 0 ? (
                  <TableRow>
                    <TableCell className="font-medium">Opening balance</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {account.openingAsOf
                        ? `as of ${dateFormat.format(account.openingAsOf)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      —
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(account.openingDue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(account.openingDue - account.opening)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(account.opening)}
                    </TableCell>
                  </TableRow>
                ) : null}
                {account.adjustmentDebit > 0 ? (
                  <TableRow>
                    <TableCell className="font-medium">Balance adjustments</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">—</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">—</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(account.adjustmentDebit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">—</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(account.adjustmentDebit)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {account.adjustments.length > 0 ? (
        <div>
          <Subheading level={2}>Balance adjustments</Subheading>
          <div className="mt-4">
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Entry</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Note</TableHeader>
                  <TableHeader className="text-right">Effect on balance</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.adjustments.map((entry) => (
                  <TableRow key={entry.id} href={`/adjustments?q=${entry.number}`}>
                    <TableCell>
                      <span className="font-mono text-xs">Adjustment {entry.number}</span>{' '}
                      <span className="text-zinc-500 dark:text-zinc-400">
                        ({ADJUSTMENT_REASON_LABELS[entry.reason]})
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(entry.adjustedOn)}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">{entry.note}</TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${entry.amount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-lime-700 dark:text-lime-400'}`}
                    >
                      {entry.amount > 0 ? '+' : '−'}
                      {currency.format(Math.abs(entry.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div>
        <Subheading level={2}>Receipts</Subheading>
        {account.receipts.length > 0 ? (
          <form
            method="get"
            className="mt-4 flex flex-wrap items-center gap-3 print:hidden"
          >
            {sortKeep.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <DateRangeFilter label="Received on" defaultFrom={from} defaultTo={to} autoSubmit />
            <RangeSlider
              label="Amount received"
              ceiling={amountCeiling(account.receipts, (row) => row.amount)}
              defaultMin={min}
              defaultMax={max}
              autoSubmit
              className="w-full sm:w-72"
            />
            {filtered ? (
              <Button plain href={pathname}>
                Clear
              </Button>
            ) : null}
            {filtered ? (
              <span className="pb-2 text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
                {receipts.length} of {account.receipts.length} receipt
                {account.receipts.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </form>
        ) : null}
        <div className="mt-4">
          {receipts.length === 0 ? (
            <EmptyState
              title={account.receipts.length === 0 ? 'No receipts' : 'No receipts match'}
              description={
                account.receipts.length === 0
                  ? 'Nothing has been received from this customer yet.'
                  : 'Try a wider date range or amount.'
              }
              action={
                account.receipts.length === 0 ? null : (
                  <Button outline href={pathname}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <SortHeader column="receipt" label="Receipt" params={sortParams} pathname={pathname} />
                  <SortHeader column="date" label="Date" params={sortParams} pathname={pathname} />
                  <SortHeader column="mode" label="Mode" params={sortParams} pathname={pathname} />
                  <SortHeader column="reference" label="Reference" params={sortParams} pathname={pathname} />
                  <SortHeader column="amount" label="Amount" params={sortParams} pathname={pathname} align="right" />
                  <SortHeader column="applied" label="Applied" params={sortParams} pathname={pathname} align="right" />
                  <SortHeader column="onaccount" label="On account" params={sortParams} pathname={pathname} align="right" />
                  <TableHeader className="w-12 print:hidden">
                    <span className="sr-only">Actions</span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt.id} href={`/payments/${receipt.id}`}>
                    <TableCell className="font-mono text-xs">
                      {receipt.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(receipt.paidOn)}
                    </TableCell>
                    <TableCell>{modeText(receipt)}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {receipt.reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(receipt.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(receipt.allocated + receipt.openingApplied)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {receipt.unallocated > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {currency.format(receipt.unallocated)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="print:hidden">
                      <RowActions
                        name={receipt.number}
                        viewHref={`/payments/${receipt.id}`}
                        deleteAction={
                          can(user.role, 'payment:delete') && !receipt.orderId
                            ? deleteReceipt.bind(null, receipt.id)
                            : undefined
                        }
                        deleteTitle={`Delete ${receipt.number}?`}
                        deleteDescription="This removes the receipt and unapplies it from any invoices, so their balances go back up. This cannot be undone."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {account.creditNotes.length > 0 ? (
        <div>
          <Subheading level={2}>Credit notes</Subheading>
          <div className="mt-4">
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Note</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Reason</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.creditNotes.map((note) => (
                  <TableRow key={note.id} href={`/notes/${note.id}`}>
                    <TableCell className="font-mono text-xs">
                      {note.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(note.noteDate)}
                    </TableCell>
                    <TableCell>
                      <Badge color="lime">
                        {NOTE_REASON_LABELS[note.reason]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(note.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
