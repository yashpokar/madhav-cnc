import { Fragment } from 'react'
import { date as dateFormat, money as currency } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import { PaymentDetailsList } from '@/components/payment-details-list'
import { detailRows } from '@/lib/payment-methods'
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
import { PrintButton } from '@/components/print-button'
import { DocumentLetterhead } from '@/components/document-letterhead'
import { getVendorPayment, openBillBalances } from '@/lib/queries/vendor-payments'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ApplyPanel } from './apply-panel'

export const metadata: Metadata = {
  title: 'Vendor payment',
}

export default async function VendorPaymentPage({
  params,
  searchParams,
}: PageProps<'/vendor-payments/[id]'>) {
  const user = await requireCapability('purchase:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const [payment, company] = await Promise.all([getVendorPayment(id), getCompanySetting()])

  if (!payment) notFound()

  const openBills = await openBillBalances(payment.vendor.id, payment.id)
  const current = Object.fromEntries(
    payment.allocations.map((row) => [row.bill.id, row.amount]),
  )
  const canUpdate = can(user.role, 'purchase:update')
  const canDelete = can(user.role, 'purchase:delete')

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{payment.number}</Heading>
            {payment.advance > 0 ? (
              <Badge color="amber">{currency.format(payment.advance)} advance to vendor</Badge>
            ) : (
              <Badge color="lime">Fully applied</Badge>
            )}
          </div>
          <Text>
            <TextLink href={`/vendors/${payment.vendor.id}`}>{payment.vendor.name}</TextLink>
            {' · '}
            {dateFormat.format(payment.paidOn)}
            {' · '}
            {modeText(payment)}
            {payment.reference ? ` · ${payment.reference}` : ''}
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintButton label="Print voucher" />
          {canUpdate ? (
            <Button outline href={`/vendor-payments/new?vendor=${payment.vendor.id}`}>
              New payment
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentLetterhead
        company={company}
        title="Payment voucher"
        reference={payment.number}
        date={payment.paidOn}
      />

      {justCreated ? (
        <FormBanner tone="success">Payment {payment.number} recorded</FormBanner>
      ) : null}

      <div className="hidden print:block">
        <dl className="grid grid-cols-2 gap-y-1 text-sm/6">
          <dt className="text-zinc-500">Paid to</dt>
          <dd className="font-medium">{payment.vendor.name}</dd>
          {payment.vendor.gstin ? (
            <>
              <dt className="text-zinc-500">GSTIN</dt>
              <dd>{payment.vendor.gstin}</dd>
            </>
          ) : null}
          <dt className="text-zinc-500">Paid on</dt>
          <dd>{dateFormat.format(payment.paidOn)}</dd>
          <dt className="text-zinc-500">Mode</dt>
          <dd>{modeText(payment)}</dd>
          {detailRows(payment.mode, payment.paymentDetails, 'out').map((row) => (
            <Fragment key={row.key}>
              <dt className="text-zinc-500">{row.label}</dt>
              <dd>{row.value}</dd>
            </Fragment>
          ))}
          {payment.reference && detailRows(payment.mode, payment.paymentDetails, 'out').length === 0 ? (
            <>
              <dt className="text-zinc-500">Reference</dt>
              <dd>{payment.reference}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="print:hidden">
        <PaymentDetailsList mode={payment.mode} details={payment.paymentDetails} direction="out" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Paid</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(payment.amount)}
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Applied to bills</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(payment.allocated + payment.openingApplied)}
          </div>
        </div>
        <div
          className={
            payment.advance > 0
              ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
              : 'surface-card p-4'
          }
        >
          <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">Advance to vendor</div>
          <div className="mt-1 text-2xl/8 font-semibold tabular-nums">
            {currency.format(payment.advance)}
          </div>
        </div>
      </div>

      {payment.allocations.length > 0 || payment.openingApplied > 0 ? (
        <div>
          <Subheading level={2}>Applied to</Subheading>
          <div className="mt-4">
            <Table dense grid>
              <TableHead>
                <TableRow>
                  <TableHeader>Bill</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader className="text-right">Bill total</TableHeader>
                  <TableHeader className="text-right">Applied</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {payment.allocations.map((row) => (
                  <TableRow key={row.id} href={`/purchase-bills/${row.bill.id}`}>
                    <TableCell className="font-mono text-xs">
                      {row.bill.number}
                      {row.bill.vendorBillNumber ? (
                        <span className="ml-2 font-sans text-zinc-500">
                          {row.bill.vendorBillNumber}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(row.bill.billDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(row.bill.total)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {payment.openingApplied > 0 ? (
                  <TableRow>
                    <TableCell className="font-medium">Opening payable</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {payment.openingAsOf ? `as of ${dateFormat.format(payment.openingAsOf)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">—</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {currency.format(payment.openingApplied)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {payment.notes ? (
        <div>
          <Subheading level={2}>Notes</Subheading>
          <Text className="mt-2 whitespace-pre-line">{payment.notes}</Text>
        </div>
      ) : null}

      <div className="print:hidden">
        <Divider />
      </div>

      {canUpdate || canDelete ? (
        <div className="print:hidden">
          <Subheading level={2}>Change what this pays for</Subheading>
          <Text className="mt-1">
            Set how much of this payment goes to each open bill. Anything you leave off is kept as
            an advance to the vendor.
          </Text>
          <div className="mt-6">
            <ApplyPanel
              paymentId={payment.id}
              amount={payment.amount}
              bills={openBills}
              current={current}
              openingLeft={payment.openingLeft}
              openingAsOf={payment.openingAsOf}
              openingApplied={payment.openingApplied}
              canUpdate={canUpdate}
              canDelete={canDelete}
            />
          </div>
        </div>
      ) : null}

      <div className="text-sm/6 text-zinc-500 dark:text-zinc-400 print:hidden">
        Recorded <LocalTime value={payment.createdAt} />
        {payment.recordedBy ? ` by ${payment.recordedBy.name}` : ''}
      </div>

      <ActivityTimeline entity="vendor-payment" id={payment.id} />
    </div>
  )
}
