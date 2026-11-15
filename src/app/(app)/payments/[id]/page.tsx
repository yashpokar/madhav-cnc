import { date as dateFormat, money as currency } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import { PaymentDetailsList } from '@/components/payment-details-list'
import { ActivityTimeline } from '@/components/activity-timeline'
import type { Metadata } from 'next'
import { LocalTime } from '@/components/local-time'
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
import { Text, TextLink } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { getReceipt, openInvoiceBalances } from '@/lib/queries/payments'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ApplyPanel } from './apply-panel'

export const metadata: Metadata = {
  title: 'Receipt',
}

export default async function ReceiptPage({
  params,
  searchParams,
}: PageProps<'/payments/[id]'>) {
  const user = await requireCapability('payment:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const receipt = await getReceipt(id)

  if (!receipt) {
    notFound()
  }

  const openInvoices = await openInvoiceBalances(receipt.customer.id, receipt.id)
  const current = Object.fromEntries(
    receipt.allocations.map((allocation) => [
      allocation.invoice.id,
      allocation.amount,
    ]),
  )

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{receipt.number}</Heading>
            {receipt.unallocated > 0 ? (
              <Badge color="amber">
                {currency.format(receipt.unallocated)} on account
              </Badge>
            ) : (
              <Badge color="lime">Fully applied</Badge>
            )}
          </div>
          <Text>
            <TextLink href={`/customers/${receipt.customer.id}`}>
              {receipt.customer.name}
            </TextLink>
            {' · '}
            {dateFormat.format(receipt.paidOn)}
            {' · '}
            {modeText(receipt)}
            {receipt.reference ? ` · ${receipt.reference}` : ''}
          </Text>
        </div>
        <Button outline href={`/payments/new?customer=${receipt.customer.id}`}>
          New receipt
        </Button>
      </div>

      {justCreated ? (
        <FormBanner
          tone="success"
          steps={[{ label: 'Record another receipt', href: '/payments/new' }]}
        >
          Receipt {receipt.number} recorded
        </FormBanner>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            Received
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(receipt.amount)}
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            Applied to invoices
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(receipt.allocated + receipt.openingApplied)}
          </div>
        </div>
        <div
          className={
            receipt.unallocated > 0
              ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
              : 'surface-card p-4'
          }
        >
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
            On account
          </div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(receipt.unallocated)}
          </div>
        </div>
      </div>

      <PaymentDetailsList mode={receipt.mode} details={receipt.paymentDetails} direction="in" />

      {receipt.allocations.length > 0 || receipt.openingApplied > 0 ? (
        <div>
          <Subheading level={2}>Applied to</Subheading>
          <div className="mt-4">
            <Table dense grid>
              <TableHead>
                <TableRow>
                  <TableHeader>Invoice</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader className="text-right">
                    Invoice total
                  </TableHeader>
                  <TableHeader className="text-right">Applied</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipt.allocations.map((allocation) => (
                  <TableRow
                    key={allocation.id}
                    href={`/invoices/${allocation.invoice.id}`}
                  >
                    <TableCell className="font-mono text-xs">
                      {allocation.invoice.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(allocation.invoice.invoiceDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(allocation.invoice.total)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(allocation.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {receipt.openingApplied > 0 ? (
                  <TableRow>
                    <TableCell className="font-medium">Opening balance</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {receipt.openingAsOf
                        ? `as of ${dateFormat.format(receipt.openingAsOf)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">—</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(receipt.openingApplied)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {receipt.notes ? (
        <div>
          <Subheading level={2}>Notes</Subheading>
          <Text className="mt-2 whitespace-pre-line">{receipt.notes}</Text>
        </div>
      ) : null}

      <Divider />

      {receipt.orderId ? (
        <Text>
          This is the advance taken on an order. It is deducted on the
          order&rsquo;s invoice automatically; to change or remove it, edit the
          advance on{' '}
          <TextLink href={`/orders/${receipt.orderId}/edit`}>the order</TextLink>.
        </Text>
      ) : (
      <div>
        <Subheading level={2}>Change what this pays for</Subheading>
        <Text className="mt-1">
          Set how much of this receipt goes to each open invoice. Anything you
          leave off stays as credit on the customer&rsquo;s account.
        </Text>
        <div className="mt-6">
          <ApplyPanel
            paymentId={receipt.id}
            receiptAmount={receipt.amount}
            invoices={openInvoices}
            current={current}
            openingLeft={receipt.openingLeft}
            openingApplied={receipt.openingApplied}
            canUpdate={can(user.role, 'payment:update')}
            canDelete={can(user.role, 'payment:delete')}
          />
        </div>
      </div>
      )}

      <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
        Recorded <LocalTime value={receipt.createdAt} />
        {receipt.recordedBy ? ` by ${receipt.recordedBy.name}` : ''}
      </div>

      <ActivityTimeline entity="payment" id={receipt.id} />
    </div>
  )
}
