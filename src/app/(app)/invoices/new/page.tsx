import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
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
import { createInvoice, suggestInterState } from '@/lib/actions/invoices'
import {
  getOrderForInvoice,
  listInvoiceableOrders,
} from '@/lib/queries/invoices'
import { getCompanySetting } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels'
import { InvoiceForm } from '../invoice-form'

export const metadata: Metadata = {
  title: 'New invoice',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export default async function NewInvoicePage({
  searchParams,
}: PageProps<'/invoices/new'>) {
  await requireCapability('invoice:create')
  const params = await searchParams
  const orderId = typeof params.order === 'string' ? params.order : null

  if (!orderId) {
    const orders = await listInvoiceableOrders()

    return (
      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 gap-2">
          <Heading>New invoice</Heading>
          <Text>Pick the order to bill.</Text>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="Nothing to invoice"
            description="Orders appear here once they are in production or beyond."
          />
        ) : (
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Order</TableHeader>
                <TableHeader>Customer</TableHeader>
                <TableHeader>Subject</TableHeader>
                <TableHeader className="text-right">Total</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Invoiced</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} href={`/invoices/new?order=${order.id}`}>
                  <TableCell className="font-mono text-xs">
                    {order.number}
                  </TableCell>
                  <TableCell className="font-medium">
                    {order.customer.name}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {order.subject ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency.format(order.total.toNumber())}
                  </TableCell>
                  <TableCell>
                    <Badge color={ORDER_STATUS_COLORS[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {order.invoices.length === 0
                      ? '—'
                      : order.invoices.map((i) => i.number).join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  const [order, company] = await Promise.all([
    getOrderForInvoice(orderId),
    getCompanySetting(),
  ])

  if (!order) {
    return (
      <EmptyState title="Order not found" description="It may have been removed." />
    )
  }

  const interState = await suggestInterState(order.customer.state)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New invoice</Heading>
        <Text>
          {order.customer.name} · {order.number}
          {order.subject ? ` · ${order.subject}` : ''}
        </Text>
        {order.invoices.length > 0 ? (
          <Text>
            Already invoiced as {order.invoices.map((i) => i.number).join(', ')}.
          </Text>
        ) : null}
        <Text>
          <Link href="/invoices/new" className="underline">
            Choose a different order
          </Link>
        </Text>
      </div>

      <InvoiceForm
        action={createInvoice}
        submitLabel="Save invoice"
        values={{
          customerId: order.customer.id,
          customerName: order.customer.name,
          orderId: order.id,
          invoiceDate: today,
          dueDate: null,
          placeOfSupply: order.customer.state,
          isInterState: interState,
          billingAddress: [
            order.customer.address,
            order.customer.city,
            order.customer.pincode,
          ]
            .filter(Boolean)
            .join(', '),
          customerGstin: order.customer.gstin,
          discountType: order.discountType,
          discountValue: order.discountValue,
          transportCharge: order.transportCharge,
          transportTaxRatePercent: order.transportTaxRatePercent,
          advanceAdjusted: order.advanceAmount,
          notes: null,
          terms: order.terms ?? company.invoiceTerms,
          lines: order.lines.map((line) => ({
            key: line.id,
            itemId: line.itemId,
            description: line.description,
            hsnCode: line.hsnCode,
            unit: line.unit,
            quantity: String(line.quantity),
            rate: String(line.rate),
            discountPercent: String(line.discountPercent),
            taxRatePercent: String(line.taxRatePercent),
          })),
        }}
      />
    </div>
  )
}
