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
import { PrintButton } from '@/components/print-button'
import { PaymentTerms } from '@/components/payment-terms'
import { getInvoice } from '@/lib/queries/invoices'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { InvoiceActions, RemovePaymentButton } from './invoice-actions'

export const metadata: Metadata = {
  title: 'Invoice',
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

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: PageProps<'/invoices/[id]'>) {
  const user = await requireCapability('invoice:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const [invoice, company] = await Promise.all([
    getInvoice(id),
    getCompanySetting(),
  ])

  if (!invoice) {
    notFound()
  }

  const canUpdate = can(user.role, 'invoice:update')
  const canTakePayment = can(user.role, 'payment:create')
  const canDeletePayment = can(user.role, 'payment:delete')

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{invoice.number}</Heading>
            <Badge color={INVOICE_STATUS_COLORS[invoice.status]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
            <Badge color={PAYMENT_STATE_COLORS[invoice.paymentState]}>
              {PAYMENT_STATE_LABELS[invoice.paymentState]}
            </Badge>
          </div>
          <Text>
            {invoice.customer.name}
            {invoice.order ? (
              <>
                {' · '}
                <TextLink href={`/orders/${invoice.order.id}`}>
                  {invoice.order.number}
                </TextLink>
              </>
            ) : null}
          </Text>
        </div>
        <div className="flex gap-3">
          <PrintButton label="Print invoice" />
          {canUpdate && invoice.status === 'DRAFT' ? (
            <Button href={`/invoices/${invoice.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {justCreated ? (
        <FormBanner tone="success">Invoice {invoice.number} created</FormBanner>
      ) : null}

      <div className="print:hidden">
        <InvoiceActions
          id={invoice.id}
          status={invoice.status}
          due={invoice.due}
          canUpdate={canUpdate}
          canTakePayment={canTakePayment}
          canCreate={can(user.role, 'invoice:create')}
        />
      </div>

      <div className="hidden print:block">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{company.companyName}</div>
            <div className="text-sm text-zinc-600">
              {[company.addressLine, company.city, company.state, company.pincode]
                .filter(Boolean)
                .join(', ')}
            </div>
            {company.gstin ? (
              <div className="text-sm text-zinc-600">GSTIN {company.gstin}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-base font-semibold">Tax invoice</div>
            <div className="font-mono text-sm">{invoice.number}</div>
            <div className="text-sm text-zinc-600">
              {dateFormat.format(invoice.invoiceDate)}
            </div>
          </div>
        </div>
      </div>

      <Divider className="print:hidden" />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>Bill to</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{invoice.customer.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {invoice.billingAddress ?? '—'}
            </div>
            {invoice.customerGstin ? (
              <div className="text-zinc-500 dark:text-zinc-400">
                GSTIN {invoice.customerGstin}
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <Subheading level={2}>Supply</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Place: {invoice.placeOfSupply ?? '—'}</div>
            <div>{invoice.isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Invoice: {dateFormat.format(invoice.invoiceDate)}</div>
            <div>
              Due: {invoice.dueDate ? dateFormat.format(invoice.dueDate) : '—'}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Outstanding</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {currency.format(invoice.due)}
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
              <TableHeader className="text-right">Taxable</TableHeader>
              {invoice.isInterState ? (
                <TableHeader className="text-right">IGST</TableHeader>
              ) : (
                <>
                  <TableHeader className="text-right">CGST</TableHeader>
                  <TableHeader className="text-right">SGST</TableHeader>
                </>
              )}
              <TableHeader className="text-right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoice.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.position}
                </TableCell>
                <TableCell className="font-medium">{line.description}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {line.hsnCode ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.amount)}
                </TableCell>
                {invoice.isInterState ? (
                  <TableCell className="text-right tabular-nums">
                    {currency.format(line.igstAmount)}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(line.cgstAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(line.sgstAmount)}
                    </TableCell>
                  </>
                )}
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
          <dd className="text-right tabular-nums">
            {currency.format(invoice.subtotal)}
          </dd>
          {invoice.discountAmount > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(invoice.discountAmount)}
              </dd>
            </>
          ) : null}
          {invoice.transportCharge > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Transport</dt>
              <dd className="text-right tabular-nums">
                {currency.format(invoice.transportCharge)}
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
          <dd className="text-right tabular-nums">
            {currency.format(invoice.taxableAmount)}
          </dd>
          {invoice.isInterState ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">IGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(invoice.igstAmount)}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">CGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(invoice.cgstAmount)}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">SGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(invoice.sgstAmount)}
              </dd>
            </>
          )}
          <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
          <dd className="text-right tabular-nums">
            {currency.format(invoice.roundOff)}
          </dd>
          <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
            {currency.format(invoice.total)}
          </dd>
          {invoice.advanceAdjusted > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Advance</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(invoice.advanceAdjusted)}
              </dd>
            </>
          ) : null}
          {invoice.paid > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Paid</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(invoice.paid)}
              </dd>
            </>
          ) : null}
          <dt className="font-medium">Due</dt>
          <dd className="text-right text-base/6 font-semibold tabular-nums">
            {currency.format(invoice.due)}
          </dd>
        </dl>
      </div>

      {invoice.payments.length > 0 ? (
        <>
          <Divider />
          <div>
            <Subheading level={2}>Payments</Subheading>
            <div className="mt-4">
              <Table dense grid>
                <TableHead>
                  <TableRow>
                    <TableHeader>Receipt</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Mode</TableHeader>
                    <TableHeader>Reference</TableHeader>
                    <TableHeader className="text-right">Amount</TableHeader>
                    <TableHeader className="text-right print:hidden" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoice.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-xs">
                        {payment.number}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {dateFormat.format(payment.paidOn)}
                      </TableCell>
                      <TableCell>{PAYMENT_MODE_LABELS[payment.mode]}</TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {payment.reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {currency.format(payment.amount)}
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                        <RemovePaymentButton
                          paymentId={payment.id}
                          canDelete={canDeletePayment}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}

      {invoice.due > 0 ? (
        <>
          <Divider />
          <PaymentTerms
            total={invoice.due}
            advancePercent={100}
            company={company}
            qrSrc={company.upiQrStoredName ? '/api/company/qr' : null}
          />
        </>
      ) : null}

      {invoice.notes || invoice.terms ? (
        <>
          <Divider />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {invoice.notes ? (
              <div>
                <Subheading level={2}>Notes</Subheading>
                <Text className="mt-2 whitespace-pre-line">{invoice.notes}</Text>
              </div>
            ) : null}
            {invoice.terms ? (
              <div>
                <Subheading level={2}>Terms</Subheading>
                <Text className="mt-2 whitespace-pre-line">{invoice.terms}</Text>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
