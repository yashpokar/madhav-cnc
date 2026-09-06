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
import { getOrder } from '@/lib/queries/orders'
import { summariseMaterial } from '@/lib/queries/quotations'
import { listTasksForOrder } from '@/lib/queries/production'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  DIMENSION_UNIT_SHORT,
  MATERIAL_SUMMARY_COLORS,
  MATERIAL_SUMMARY_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { OrderStatusActions } from './status-actions'
import { ProductionPanel } from './production-panel'

export const metadata: Metadata = {
  title: 'Order',
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

export default async function QuotationDetailPage({
  params,
  searchParams,
}: PageProps<'/orders/[id]'>) {
  const user = await requireCapability('order:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const order = await getOrder(id)

  if (!order) {
    notFound()
  }

  const tasks = await listTasksForOrder(order.id)
  const canUpdateProduction = can(user.role, 'production:update')

  const materialSummary = summariseMaterial(order.lines)
  const canUpdate = can(user.role, 'order:update')
  const editable = order.status === 'DRAFT' || order.status === 'CONFIRMED'

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-3">
            <Heading>
              {order.number}
        
            </Heading>
            <Badge color={ORDER_STATUS_COLORS[order.status]}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            <Badge color={MATERIAL_SUMMARY_COLORS[materialSummary]}>
              {MATERIAL_SUMMARY_LABELS[materialSummary]}
            </Badge>
          </div>
          <Text>
            {order.customer.name}
            {order.subject ? ` · ${order.subject}` : ''}
          </Text>
          {order.quotation ? (
            <Text>
              From quotation{' '}
              <TextLink href={`/quotations/${order.quotation.id}`}>
                {order.quotation.number}
                {order.quotation.revision > 1
                  ? ` R${order.quotation.revision}`
                  : ''}
              </TextLink>
            </Text>
          ) : null}
        </div>
        <div className="flex gap-3">
          {can(user.role, 'invoice:create') &&
          order.status !== 'DRAFT' &&
          order.status !== 'CANCELLED' ? (
            <Button outline href={`/invoices/new?order=${order.id}`}>
              New invoice
            </Button>
          ) : null}
          {can(user.role, 'dispatch:create') &&
          order.status !== 'DRAFT' &&
          order.status !== 'CANCELLED' ? (
            <Button outline href={`/dispatch/new?order=${order.id}`}>
              New challan
            </Button>
          ) : null}
          {canUpdate && editable ? (
            <Button href={`/orders/${order.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {justCreated ? (
        <FormBanner tone="success">
          Order {order.number} created
        </FormBanner>
      ) : null}

      <OrderStatusActions
        id={order.id}
        status={order.status}
        canUpdate={canUpdate}
      />

      <Divider />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>Customer</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{order.customer.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {order.customer.code} · {order.customer.phone}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Referred by</Subheading>
          <div className="mt-2 text-sm/6">
            <div>
              Architect:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {order.architect?.name ?? '—'}
              </span>
            </div>
            <div>
              Carpenter:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {order.carpenter?.name ?? '—'}
              </span>
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Material</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">
              {MATERIAL_SUMMARY_LABELS[materialSummary]}
            </div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {materialSummary === 'WITHOUT'
                ? 'Customer supplies all material; job work only.'
                : materialSummary === 'MIXED'
                  ? 'Some lines use customer material, some ours.'
                  : 'We supply the material and do the work.'}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6">
            <div>
              Ordered:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {dateFormat.format(order.orderDate)}
              </span>
            </div>
            <div>
              Due:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {order.dueDate ? dateFormat.format(order.dueDate) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {order.siteAddress || order.siteCity ? (
        <div>
          <Subheading level={2}>Site</Subheading>
          <Text className="mt-2">
            {[order.siteAddress, order.siteCity, order.sitePincode]
              .filter(Boolean)
              .join(', ')}
          </Text>
        </div>
      ) : null}

      <Divider />

      <ProductionPanel
        orderId={order.id}
        orderStatus={order.status}
        tasks={tasks}
        canUpdate={canUpdateProduction}
      />

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Size</TableHeader>
              <TableHeader className="text-right">Qty</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">Disc</TableHeader>
              <TableHeader className="text-right">GST</TableHeader>
              <TableHeader className="text-right">Amount</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.position}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{line.description}</span>
                    {line.materialSupply === 'WITHOUT_MATERIAL' ? (
                      <Badge color="orange">Job work</Badge>
                    ) : null}
                  </div>
                  {line.hsnCode ? (
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      HSN {line.hsnCode}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {line.dimensionUnit && line.length && line.width
                    ? `${line.length} × ${line.width} ${DIMENSION_UNIT_SHORT[line.dimensionUnit]}${
                        line.pieces ? ` × ${line.pieces}` : ''
                      }`
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.discountPercent > 0 ? `${line.discountPercent}%` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.taxRatePercent}%
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(line.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <dl className="grid w-full max-w-sm grid-cols-2 gap-y-2 text-sm/6">
          <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
          <dd className="text-right tabular-nums">
            {currency.format(order.subtotal)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
          <dd className="text-right tabular-nums">
            −{currency.format(order.discountAmount)}
          </dd>
          {order.transportCharge > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Transport</dt>
              <dd className="text-right tabular-nums">
                {currency.format(order.transportCharge)}
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
          <dd className="text-right tabular-nums">
            {currency.format(order.taxableAmount)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">GST</dt>
          <dd className="text-right tabular-nums">
            {currency.format(order.taxAmount)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
          <dd className="text-right tabular-nums">
            {currency.format(order.roundOff)}
          </dd>
          <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right text-base/6 font-semibold tabular-nums dark:border-white/10">
            {currency.format(order.total)}
          </dd>
          {order.advanceAmount > 0 ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">Advance</dt>
              <dd className="text-right tabular-nums">
                −{currency.format(order.advanceAmount)}
              </dd>
              <dt className="font-medium">Balance</dt>
              <dd className="text-right font-semibold tabular-nums">
                {currency.format(order.total - order.advanceAmount)}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {order.notes || order.terms ? (
        <>
          <Divider />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {order.notes ? (
              <div>
                <Subheading level={2}>Notes</Subheading>
                <Text className="mt-2 whitespace-pre-line">
                  {order.notes}
                </Text>
              </div>
            ) : null}
            {order.terms ? (
              <div>
                <Subheading level={2}>Terms &amp; conditions</Subheading>
                <Text className="mt-2 whitespace-pre-line">
                  {order.terms}
                </Text>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
