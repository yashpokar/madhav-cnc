import { date as dateFormat, money as currency } from '@/lib/format'
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
import { EmptyState } from '@/components/form-banner'
import { PrintButton } from '@/components/print-button'
import { DocumentLetterhead } from '@/components/document-letterhead'
import { getVendorStatement } from '@/lib/queries/payables'
import { getCompanySetting } from '@/lib/queries/company'
import { BILL_PAYMENT_COLORS, BILL_PAYMENT_LABELS } from '@/lib/labels'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Vendor statement',
}

export default async function VendorStatementPage({
  params,
}: PageProps<'/vendors/[id]/statement'>) {
  const user = await requireCapability('purchase:read')
  const { id } = await params

  const [statement, company] = await Promise.all([
    getVendorStatement(id, new Date()),
    getCompanySetting(),
  ])

  if (!statement) notFound()

  const owing = statement.net > 0
  const settled = Math.abs(statement.net) < 0.005

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <Heading>{statement.vendor.name}</Heading>
          <Text>
            Statement of account
            {statement.vendor.phone ? ` · ${statement.vendor.phone}` : ''}
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintButton label="Print statement" />
          <Button outline href={`/vendors/${statement.vendor.id}`}>
            Vendor
          </Button>
          {can(user.role, 'purchase:update') ? (
            <Button href={`/vendor-payments/new?vendor=${statement.vendor.id}`}>
              Record payment
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentLetterhead
        company={company}
        title="Statement of account"
        reference={statement.vendor.name}
        date={new Date()}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Open bills</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(statement.billsDue)}
          </div>
          {statement.openingLeft > 0 ? (
            <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">
              + {currency.format(statement.openingLeft)} opening payable
            </div>
          ) : null}
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Overdue</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(statement.overdue)}
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Advance held</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(statement.advance)}
          </div>
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
            {owing ? 'You owe' : settled ? 'Settled' : 'Vendor owes you (advance)'}
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(Math.abs(statement.net))}
          </div>
        </div>
      </div>

      <Divider />

      <div>
        <Subheading level={2}>Open bills</Subheading>
        <div className="mt-4">
          {statement.openBills.length === 0 && statement.openingLeft <= 0 ? (
            <EmptyState title="No open bills" description="Everything billed by this vendor is paid." />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Bill</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Due</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Total</TableHeader>
                  <TableHeader className="text-right">Paid</TableHeader>
                  <TableHeader className="text-right">Balance</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {statement.openBills.map((bill) => (
                  <TableRow key={bill.id} href={`/purchase-bills/${bill.id}`}>
                    <TableCell className="font-mono text-xs">{bill.number}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(bill.billDate)}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {bill.dueDate ? dateFormat.format(bill.dueDate) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge color={BILL_PAYMENT_COLORS[bill.status]}>
                        {BILL_PAYMENT_LABELS[bill.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{currency.format(bill.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency.format(bill.paid)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(bill.due)}
                    </TableCell>
                  </TableRow>
                ))}
                {statement.openingLeft > 0 ? (
                  <TableRow>
                    <TableCell className="font-medium">Opening payable</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {statement.openingAsOf ? `as of ${dateFormat.format(statement.openingAsOf)}` : '—'}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">—</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">
                      {currency.format(statement.openingPayable)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(statement.openingPayable - statement.openingLeft)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(statement.openingLeft)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div>
        <Subheading level={2}>Account activity</Subheading>
        <Text className="mt-1">
          Bills raise what you owe, payments reduce it. A negative balance is an advance held by
          the vendor.
        </Text>
        <div className="mt-4">
          {statement.entries.length === 0 ? (
            <EmptyState
              title="No activity"
              description="Posted bills and payments for this vendor appear here."
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Entry</TableHeader>
                  <TableHeader>Details</TableHeader>
                  <TableHeader className="text-right">Billed</TableHeader>
                  <TableHeader className="text-right">Paid</TableHeader>
                  <TableHeader className="text-right">Balance</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {statement.entries.map((entry, index) => (
                  <TableRow key={`${entry.kind}-${entry.id ?? index}`} href={entry.href ?? undefined}>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(entry.date)}
                    </TableCell>
                    <TableCell className={entry.kind === 'opening' ? 'font-medium' : 'font-mono text-xs'}>
                      {entry.label}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">{entry.detail}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.debit > 0 ? currency.format(entry.debit) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.credit > 0 ? currency.format(entry.credit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(entry.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
