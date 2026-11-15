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
import { ConfirmButton } from '@/components/confirm-button'
import { DocumentLetterhead } from '@/components/document-letterhead'
import { deleteOrder } from '@/lib/actions/purchase-orders'
import { getCompanySetting } from '@/lib/queries/company'
import { getPurchaseOrder } from '@/lib/queries/purchases'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { canEditOrder, orderMessage } from '@/lib/purchase-rules'
import {
  BILL_STATUS_COLORS,
  BILL_STATUS_LABELS,
  PO_STATUS_COLORS,
  PO_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { OrderActions } from './order-actions'

export const metadata: Metadata = {
  title: 'Purchase order',
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps<'/purchase-orders/[id]'>) {
  const user = await requireCapability('purchase:read')
  const { id } = await params
  const query = await searchParams

  const [order, company] = await Promise.all([getPurchaseOrder(id), getCompanySetting()])

  if (!order) notFound()

  const canUpdate = can(user.role, 'purchase:update')
  const canCreate = can(user.role, 'purchase:create')
  const canDelete = can(user.role, 'purchase:delete')
  const deletable = order.status === 'DRAFT' || order.status === 'CANCELLED'

  const message = orderMessage({
    company: company.companyName,
    vendor: order.vendor.name,
    number: order.number,
    orderDate: dateFormat.format(order.orderDate),
    expectedDate: order.expectedDate ? dateFormat.format(order.expectedDate) : null,
    lines: order.lines.map((line) => ({
      description: line.description,
      qty: line.qty,
      unit: UNIT_SHORT[line.unit],
      rate: line.rate,
    })),
    total: order.total,
    notes: order.notes,
  })

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{order.number}</Heading>
            <Badge color={PO_STATUS_COLORS[order.status]}>{PO_STATUS_LABELS[order.status]}</Badge>
          </div>
          <Text>
            <TextLink href={`/vendors/${order.vendor.id}`}>{order.vendor.name}</TextLink>
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDelete && deletable ? (
            <ConfirmButton
              label="Delete"
              title={`Delete order ${order.number}?`}
              description="This permanently removes the purchase order. This cannot be undone."
              confirmLabel="Delete order"
              redirectTo="/purchase-orders"
              action={deleteOrder.bind(null, order.id)}
            />
          ) : null}
          {canUpdate && canEditOrder(order.status) ? (
            <Button href={`/purchase-orders/${order.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {query.created === '1' ? (
        <FormBanner tone="success">Purchase order {order.number} saved</FormBanner>
      ) : null}

      <OrderActions
        id={order.id}
        status={order.status}
        vendorPhone={order.vendor.phone}
        message={message}
        canUpdate={canUpdate}
        canCreate={canCreate}
      />

      <DocumentLetterhead
        company={company}
        title="Purchase order"
        reference={order.number}
        date={order.orderDate}
        secondaryLabel="Needed by"
        secondaryDate={order.expectedDate}
      />

      <Divider className="print:hidden" />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Subheading level={2}>Vendor</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{order.vendor.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {[order.vendor.address, order.vendor.city].filter(Boolean).join(', ') || '—'}
            </div>
            {order.vendor.phone ? (
              <div className="text-zinc-500 dark:text-zinc-400">{order.vendor.phone}</div>
            ) : null}
            {order.vendor.gstin ? (
              <div className="text-zinc-500 dark:text-zinc-400">GSTIN {order.vendor.gstin}</div>
            ) : null}
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Ordered: {dateFormat.format(order.orderDate)}</div>
            <div>
              Expected: {order.expectedDate ? dateFormat.format(order.expectedDate) : '—'}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Order total</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {currency.format(order.total)}
          </div>
          <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">including GST</div>
        </div>
      </div>

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader className="text-right">Qty</TableHeader>
              <TableHeader className="text-right print:hidden">Received</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">GST %</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.lines.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">{line.description}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.qty} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums print:hidden">
                  {line.receivedQty}
                </TableCell>
                <TableCell className="text-right tabular-nums">{currency.format(line.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{line.taxRatePercent}%</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(line.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {order.notes ? (
        <div>
          <Subheading level={2}>Notes</Subheading>
          <Text className="mt-2 whitespace-pre-line">{order.notes}</Text>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 print:hidden">
        <div>
          <Subheading level={2}>Bills</Subheading>
          {order.bills.length === 0 ? (
            <Text className="mt-2">No bills have been created from this order yet.</Text>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm/6">
              {order.bills.map((bill) => (
                <li key={bill.id} className="flex items-center gap-3">
                  <TextLink href={`/purchase-bills/${bill.id}`}>{bill.number}</TextLink>
                  <Badge color={BILL_STATUS_COLORS[bill.status]}>
                    {BILL_STATUS_LABELS[bill.status]}
                  </Badge>
                  <span className="tabular-nums">{currency.format(bill.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <Subheading level={2}>Goods received</Subheading>
          <Text className="mt-2">
            Receiving goods against this order, which moves it to part received and received,
            comes in a later release.
          </Text>
        </div>
      </div>

      <ActivityTimeline entity="purchase-order" id={order.id} />
    </div>
  )
}
