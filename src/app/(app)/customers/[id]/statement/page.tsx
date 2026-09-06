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
import { customerAccount } from '@/lib/queries/payments'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { NOTE_REASON_LABELS, PAYMENT_MODE_LABELS } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Customer statement',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function CustomerStatementPage({
  params,
}: PageProps<'/customers/[id]/statement'>) {
  const user = await requireCapability('payment:read')
  const { id } = await params

  const [account, company] = await Promise.all([
    customerAccount(id),
    getCompanySetting(),
  ])

  if (!account) {
    notFound()
  }

  const owing = account.net > 0

  return (
    <div className="grid grid-cols-1 gap-8">
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
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            Open bills
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.due)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            On account
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.onAccount)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            Credit notes
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(account.credit)}
          </div>
        </div>
        <div
          className={
            owing
              ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
              : 'rounded-lg bg-lime-50 p-4 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:ring-lime-400/20'
          }
        >
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            {owing ? 'Customer owes' : 'In credit'}
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
          {account.invoices.length === 0 ? (
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
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div>
        <Subheading level={2}>Receipts</Subheading>
        <div className="mt-4">
          {account.receipts.length === 0 ? (
            <EmptyState
              title="No receipts"
              description="Nothing has been received from this customer yet."
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Receipt</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Mode</TableHeader>
                  <TableHeader>Reference</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                  <TableHeader className="text-right">Applied</TableHeader>
                  <TableHeader className="text-right">On account</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.receipts.map((receipt) => (
                  <TableRow key={receipt.id} href={`/payments/${receipt.id}`}>
                    <TableCell className="font-mono text-xs">
                      {receipt.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(receipt.paidOn)}
                    </TableCell>
                    <TableCell>{PAYMENT_MODE_LABELS[receipt.mode]}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {receipt.reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(receipt.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(receipt.allocated)}
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
