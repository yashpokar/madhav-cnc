import type { Metadata } from 'next'
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
import { getReceivables } from '@/lib/queries/receivables'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { PAYMENT_MODE_LABELS, ORDER_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Payments',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const exact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function Tile({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'plain' | 'alert'
}) {
  return (
    <div
      className={
        tone === 'alert'
          ? 'rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20'
          : 'rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10'
      }
    >
      <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl/8 font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export default async function PaymentsPage() {
  const user = await requireCapability('payment:read')
  const data = await getReceivables()
  const canSeeOrders = can(user.role, 'order:read')
  const canRecord = can(user.role, 'payment:create')

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Payments</Heading>
          <Text>What is still to be recovered, and what has come in.</Text>
        </div>
        <div className="flex gap-3">
          <Button outline href="/invoices?tab=issued">
            Issued invoices
          </Button>
          {canRecord ? (
            <Button href="/payments/new">Record receipt</Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Yet to recover"
          value={currency.format(data.netReceivable)}
          hint={
            data.creditOutstanding > 0 || data.onAccountTotal > 0
              ? `${currency.format(data.outstanding)} billed, less ${currency.format(data.creditOutstanding + data.onAccountTotal)} credit held`
              : `across ${data.invoices.length} issued invoice${data.invoices.length === 1 ? '' : 's'}`
          }
        />
        <Tile
          label="Overdue"
          value={currency.format(data.overdue)}
          hint={
            data.overdue > 0
              ? 'past the due date'
              : 'nothing past its due date'
          }
          tone={data.overdue > 0 ? 'alert' : 'plain'}
        />
        <Tile
          label="Yet to bill"
          value={currency.format(data.toBillTotal)}
          hint={`${data.toBill.length} order${data.toBill.length === 1 ? '' : 's'} delivered but not invoiced`}
        />
        <Tile
          label="Collected (30 days)"
          value={currency.format(data.collected30)}
          hint={`${data.collected30Count} payment${data.collected30Count === 1 ? '' : 's'} received`}
        />
      </div>

      <div>
        <Subheading level={2}>Ageing</Subheading>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.aging.map((bucket) => (
            <div
              key={bucket.key}
              className="rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10"
            >
              <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">
                {bucket.label}
              </div>
              <div className="mt-1 text-lg/7 font-semibold tabular-nums">
                {currency.format(bucket.amount)}
              </div>
              <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      <div>
        <Subheading level={2}>Outstanding by customer</Subheading>
        <div className="mt-4">
          {data.byCustomer.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="Every issued invoice is fully settled."
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader className="text-right">Invoices</TableHeader>
                  <TableHeader className="text-right">Due</TableHeader>
                  <TableHeader className="text-right">Overdue</TableHeader>
                  <TableHeader className="text-right">On account</TableHeader>
                  <TableHeader className="text-right">Credit notes</TableHeader>
                  <TableHeader className="text-right">Net</TableHeader>
                  <TableHeader className="text-right">Oldest</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.byCustomer.map((row) => (
                  <TableRow key={row.id} href={`/customers/${row.id}/statement`}>
                    <TableCell className="font-medium">
                      {row.name}
                      {row.phone ? (
                        <div className="text-zinc-500 dark:text-zinc-400">
                          {row.phone}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.invoices}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {exact.format(row.due)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.overdue > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {exact.format(row.overdue)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.onAccount > 0 ? `−${exact.format(row.onAccount)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.credit > 0 ? `−${exact.format(row.credit)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {exact.format(row.net)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.oldestDays > 0 ? `${row.oldestDays}d` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {data.invoices.length > 0 ? (
        <>
          <Divider />
          <div>
            <Subheading level={2}>Open invoices</Subheading>
            <div className="mt-4">
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <TableHeader>Applied to</TableHeader>
                    <TableHeader>Customer</TableHeader>
                    <TableHeader>Due date</TableHeader>
                    <TableHeader className="text-right">Total</TableHeader>
                    <TableHeader className="text-right">Received</TableHeader>
                    <TableHeader className="text-right">Balance</TableHeader>
                    <TableHeader>Age</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.invoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                    >
                      <TableCell className="font-mono text-xs">
                        {invoice.number}
                        {invoice.order ? (
                          <div className="text-zinc-500 dark:text-zinc-400">
                            {invoice.order.number}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">
                        {invoice.customer.name}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {invoice.dueDate
                          ? dateFormat.format(invoice.dueDate)
                          : dateFormat.format(invoice.invoiceDate)}
                        {invoice.dueDate ? null : (
                          <div className="text-xs/5">no due date set</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {exact.format(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {exact.format(invoice.paid)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {exact.format(invoice.due)}
                      </TableCell>
                      <TableCell>
                        {invoice.overdueBy > 0 ? (
                          <Badge
                            color={invoice.overdueBy > 60 ? 'red' : 'amber'}
                          >
                            {invoice.overdueBy}d overdue
                          </Badge>
                        ) : (
                          <Badge color="zinc">Not due</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}

      {canSeeOrders && data.toBill.length > 0 ? (
        <>
          <Divider />
          <div>
            <Subheading level={2}>Delivered but not invoiced</Subheading>
            <Text className="mt-1">
              Raise an invoice so this becomes recoverable.
            </Text>
            <div className="mt-4">
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <TableHeader>Order</TableHeader>
                    <TableHeader>Customer</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Order date</TableHeader>
                    <TableHeader className="text-right">Value</TableHeader>
                    <TableHeader className="text-right">Waiting</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.toBill.map((order) => (
                    <TableRow key={order.id} href={`/orders/${order.id}`}>
                      <TableCell className="font-mono text-xs">
                        {order.number}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.customer.name}
                      </TableCell>
                      <TableCell>
                        <Badge color="zinc">
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {dateFormat.format(order.orderDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {exact.format(order.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.waitingDays}d
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}

      <Divider />

      <div>
        <Subheading level={2}>Recent payments</Subheading>
        <div className="mt-4">
          {data.payments.length === 0 ? (
            <EmptyState
              title="No payments recorded"
              description="Payments show up here as you record them against invoices."
            />
          ) : (
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Receipt</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader>Applied to</TableHeader>
                  <TableHeader>Mode</TableHeader>
                  <TableHeader>Reference</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.payments.map((payment) => (
                  <TableRow key={payment.id} href={`/payments/${payment.id}`}>
                    <TableCell className="font-mono text-xs">
                      {payment.number}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(payment.paidOn)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {payment.customer.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payment.invoiceNumbers.length === 0 ? (
                        <span className="font-sans text-amber-600 dark:text-amber-400">
                          On account
                        </span>
                      ) : (
                        payment.invoiceNumbers.join(', ')
                      )}
                      {payment.unallocated > 0 &&
                      payment.invoiceNumbers.length > 0 ? (
                        <div className="font-sans text-amber-600 dark:text-amber-400">
                          {exact.format(payment.unallocated)} on account
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{PAYMENT_MODE_LABELS[payment.mode]}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {payment.reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {exact.format(payment.amount)}
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
