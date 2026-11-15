import { date as dateFormat, money as currency } from '@/lib/format'
import { ActivityTimeline } from '@/components/activity-timeline'
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
import { Text, TextLink } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { RECEIPT_STATUS_COLORS, RECEIPT_STATUS_LABELS } from '@/lib/receipt-labels'
import { ConfirmButton } from '@/components/confirm-button'
import { deleteBill } from '@/lib/actions/purchase-bills'
import { getBill } from '@/lib/queries/purchases'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  BILL_PAYMENT_COLORS,
  BILL_PAYMENT_LABELS,
  BILL_STATUS_COLORS,
  BILL_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { BillActions } from './bill-actions'

export const metadata: Metadata = {
  title: 'Purchase bill',
}

export default async function BillDetailPage({
  params,
  searchParams,
}: PageProps<'/purchase-bills/[id]'>) {
  const user = await requireCapability('purchase:read')
  const { id } = await params
  const query = await searchParams

  const bill = await getBill(id)

  if (!bill) notFound()

  const canUpdate = can(user.role, 'purchase:update')
  const canCreate = can(user.role, 'purchase:create')
  const canDelete = can(user.role, 'purchase:delete')
  const canReceive =
    can(user.role, 'stock:create') && bill.lines.some((line) => line.itemId || line.materialId)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{bill.number}</Heading>
            <Badge color={BILL_STATUS_COLORS[bill.status]}>
              {BILL_STATUS_LABELS[bill.status]}
            </Badge>
            {bill.paymentStatus ? (
              <Badge color={BILL_PAYMENT_COLORS[bill.paymentStatus]}>
                {BILL_PAYMENT_LABELS[bill.paymentStatus]}
              </Badge>
            ) : null}
          </div>
          <Text>
            <TextLink href={`/vendors/${bill.vendor.id}`}>{bill.vendor.name}</TextLink>
            {bill.vendorBillNumber ? ` · Vendor bill ${bill.vendorBillNumber}` : ''}
            {bill.po ? (
              <>
                {' · '}
                <TextLink href={`/purchase-orders/${bill.po.id}`}>{bill.po.number}</TextLink>
              </>
            ) : null}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDelete && bill.status !== 'POSTED' ? (
            <ConfirmButton
              label="Delete"
              title={`Delete bill ${bill.number}?`}
              description="This permanently removes the bill. This cannot be undone."
              confirmLabel="Delete bill"
              redirectTo="/purchase-bills"
              action={deleteBill.bind(null, bill.id)}
            />
          ) : null}
          {canUpdate && bill.status === 'DRAFT' ? (
            <Button href={`/purchase-bills/${bill.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {query.created === '1' ? (
        <FormBanner tone="success">Bill {bill.number} saved as a draft</FormBanner>
      ) : null}

      <BillActions
        id={bill.id}
        status={bill.status}
        hasPayments={bill.payments.length > 0}
        vendorId={bill.vendorId}
        balance={bill.due}
        canUpdate={canUpdate}
        canCreate={canCreate}
        canReceive={canReceive}
      />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>Vendor</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{bill.vendor.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {[bill.vendor.address, bill.vendor.city].filter(Boolean).join(', ') || '—'}
            </div>
            {bill.vendor.gstin ? (
              <div className="text-zinc-500 dark:text-zinc-400">GSTIN {bill.vendor.gstin}</div>
            ) : null}
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Bill: {dateFormat.format(bill.billDate)}</div>
            <div>Due: {bill.dueDate ? dateFormat.format(bill.dueDate) : '—'}</div>
            <div>{bill.isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Recorded by</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {bill.createdBy?.name ?? '—'}
          </div>
        </div>
        <div>
          <Subheading level={2}>Balance due</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {bill.status === 'POSTED' ? currency.format(bill.due) : '—'}
          </div>
        </div>
      </div>

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>HSN</TableHeader>
              <TableHeader className="text-right">Qty</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">Discount</TableHeader>
              <TableHeader className="text-right">Taxable</TableHeader>
              <TableHeader className="text-right">GST</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {bill.lines.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">{line.description}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {line.hsnCode ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.qty} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums">{currency.format(line.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.discount > 0 ? currency.format(line.discount) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{currency.format(line.taxable)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.taxAmount)}
                  <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {line.taxRatePercent}%
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(line.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <dl className="grid w-full grid-cols-2 gap-y-2 text-sm/6 sm:max-w-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
          <dd className="text-right tabular-nums">{currency.format(bill.subtotal)}</dd>
          {bill.discount > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
              <dd className="text-right tabular-nums">−{currency.format(bill.discount)}</dd>
            </>
          ) : null}
          <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
          <dd className="text-right tabular-nums">{currency.format(bill.taxableAmount)}</dd>
          {bill.isInterState ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">IGST</dt>
              <dd className="text-right tabular-nums">{currency.format(bill.igst)}</dd>
            </>
          ) : (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">CGST</dt>
              <dd className="text-right tabular-nums">{currency.format(bill.cgst)}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">SGST</dt>
              <dd className="text-right tabular-nums">{currency.format(bill.sgst)}</dd>
            </>
          )}
          <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
          <dd className="text-right tabular-nums">{currency.format(bill.roundOff)}</dd>
          <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">Total</dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
            {currency.format(bill.total)}
          </dd>
          {bill.paid > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Paid</dt>
              <dd className="text-right tabular-nums">−{currency.format(bill.paid)}</dd>
            </>
          ) : null}
          {bill.status === 'POSTED' ? (
            <>
              <dt className="font-medium">Balance due</dt>
              <dd className="text-right text-base/6 font-semibold tabular-nums">
                {currency.format(bill.due)}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {bill.notes ? (
        <>
          <Divider />
          <div>
            <Subheading level={2}>Notes</Subheading>
            <Text className="mt-2 whitespace-pre-line">{bill.notes}</Text>
          </div>
        </>
      ) : null}

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <Subheading level={2}>Payments applied</Subheading>
          {bill.payments.length === 0 ? (
            <Text className="mt-2">No payments have been applied to this bill.</Text>
          ) : (
            <div className="mt-4">
              <Table dense grid>
                <TableHead>
                  <TableRow>
                    <TableHeader>Payment</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Mode</TableHeader>
                    <TableHeader className="text-right">Amount</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bill.payments.map((payment) => (
                    <TableRow key={payment.id} href={`/vendor-payments/${payment.paymentId}`}>
                      <TableCell className="font-mono text-xs">{payment.number}</TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {dateFormat.format(payment.paidOn)}
                      </TableCell>
                      <TableCell>{payment.modeName}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {currency.format(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <Subheading level={2}>Goods received</Subheading>
          {bill.receipts.length === 0 ? (
            <Text className="mt-2">
              {bill.status === 'POSTED'
                ? 'No goods have been received against this bill yet.'
                : 'Goods can be received once the bill is posted, or tick "Mark goods as received now" when posting.'}
            </Text>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm/6">
              {bill.receipts.map((receipt) => (
                <li key={receipt.id} className="flex items-center gap-3">
                  <TextLink href={`/goods-receipts/${receipt.id}`}>{receipt.number}</TextLink>
                  <Badge color={RECEIPT_STATUS_COLORS[receipt.status]}>
                    {RECEIPT_STATUS_LABELS[receipt.status]}
                  </Badge>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {dateFormat.format(receipt.receivedOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {bill.status === 'POSTED' && canReceive ? (
            <div className="mt-3">
              <Button outline href={`/goods-receipts/new?bill=${bill.id}`}>
                Receive goods
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <ActivityTimeline entity="purchase-bill" id={bill.id} />
    </div>
  )
}
