import { Suspense } from 'react'
import {
  fmtDate,
  inr,
  RelatedTable,
  StatusBadge,
} from '@/components/related-table'
import {
  DISPATCH_STATUS_COLORS,
  DISPATCH_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  NOTE_KIND_COLORS,
  NOTE_KIND_SHORT,
  NOTE_STATUS_COLORS,
  NOTE_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
} from '@/lib/labels'
import { FEATURES } from '@/lib/features'
import { can } from '@/lib/permissions'
import {
  customerRelated,
  invoiceRelated,
  itemRelated,
  orderRelated,
  partnerRelated,
  quotationRelated,
} from '@/lib/queries/related'
import type { UserRole } from '@/generated/prisma/enums'


function Fallback() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="h-24 animate-pulse rounded-lg bg-zinc-950/5 motion-reduce:animate-none dark:bg-white/5"
    >
      <span className="sr-only">Loading related records…</span>
    </div>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 print:hidden">
      <Suspense fallback={<Fallback />}>{children}</Suspense>
    </div>
  )
}

const money = (value: number) => inr.format(value)

const quotationRow = (
  r: {
    id: string
    number: string
    status: keyof typeof QUOTATION_STATUS_LABELS
    quotationDate: Date
    total: number
    revision?: number
    customer?: { name: string }
  },
  withCustomer: boolean,
) => ({
  key: r.id,
  href: `/quotations/${r.id}`,
  cells: [
    r.revision && r.revision > 1 ? `${r.number} R${r.revision}` : r.number,
    ...(withCustomer ? [r.customer?.name ?? '—'] : []),
    fmtDate(r.quotationDate),
    <StatusBadge
      key="s"
      label={QUOTATION_STATUS_LABELS[r.status]}
      color={QUOTATION_STATUS_COLORS[r.status]}
    />,
    money(r.total),
  ],
})

const orderRow = (
  r: {
    id: string
    number: string
    status: keyof typeof ORDER_STATUS_LABELS
    orderDate: Date
    dueDate: Date | null
    total: number
    customer?: { name: string }
  },
  withCustomer: boolean,
) => ({
  key: r.id,
  href: `/orders/${r.id}`,
  cells: [
    r.number,
    ...(withCustomer ? [r.customer?.name ?? '—'] : []),
    fmtDate(r.orderDate),
    fmtDate(r.dueDate),
    <StatusBadge
      key="s"
      label={ORDER_STATUS_LABELS[r.status]}
      color={ORDER_STATUS_COLORS[r.status]}
    />,
    money(r.total),
  ],
})

const invoiceRow = (r: {
  id: string
  number: string
  status: keyof typeof INVOICE_STATUS_LABELS
  invoiceDate: Date
  dueDate: Date | null
  total: number
}) => ({
  key: r.id,
  href: `/invoices/${r.id}`,
  cells: [
    r.number,
    fmtDate(r.invoiceDate),
    fmtDate(r.dueDate),
    <StatusBadge
      key="s"
      label={INVOICE_STATUS_LABELS[r.status]}
      color={INVOICE_STATUS_COLORS[r.status]}
    />,
    money(r.total),
  ],
})

const noteRow = (r: {
  id: string
  number: string
  kind: keyof typeof NOTE_KIND_SHORT
  status: keyof typeof NOTE_STATUS_LABELS
  noteDate: Date
  total: number
}) => ({
  key: r.id,
  href: `/notes/${r.id}`,
  cells: [
    r.number,
    <StatusBadge key="k" label={NOTE_KIND_SHORT[r.kind]} color={NOTE_KIND_COLORS[r.kind]} />,
    fmtDate(r.noteDate),
    <StatusBadge
      key="s"
      label={NOTE_STATUS_LABELS[r.status]}
      color={NOTE_STATUS_COLORS[r.status]}
    />,
    money(r.total),
  ],
})

const QUOTE_COLS = (withCustomer: boolean) => [
  { label: 'Number' },
  ...(withCustomer ? [{ label: 'Customer' }] : []),
  { label: 'Date' },
  { label: 'Status' },
  { label: 'Total', align: 'right' as const },
]
const ORDER_COLS = (withCustomer: boolean) => [
  { label: 'Number' },
  ...(withCustomer ? [{ label: 'Customer' }] : []),
  { label: 'Ordered' },
  { label: 'Due' },
  { label: 'Status' },
  { label: 'Total', align: 'right' as const },
]
const INVOICE_COLS = [
  { label: 'Number' },
  { label: 'Date' },
  { label: 'Due' },
  { label: 'Status' },
  { label: 'Total', align: 'right' as const },
]
const NOTE_COLS = [
  { label: 'Number' },
  { label: 'Type' },
  { label: 'Date' },
  { label: 'Status' },
  { label: 'Total', align: 'right' as const },
]

async function CustomerBody({ id, name, role }: { id: string; name: string; role: UserRole }) {
  const data = await customerRelated(id)
  const q = encodeURIComponent(name)

  return (
    <>
      {can(role, 'quotation:read') ? (
        <RelatedTable
          title="Quotations"
          count={data.quotations.count}
          columns={QUOTE_COLS(false)}
          rows={data.quotations.rows.map((r) => quotationRow(r, false))}
          empty="No quotations for this customer yet."
          allHref={`/quotations?q=${q}`}
        />
      ) : null}
      {can(role, 'order:read') ? (
        <RelatedTable
          title="Orders"
          count={data.orders.count}
          columns={ORDER_COLS(false)}
          rows={data.orders.rows.map((r) => orderRow(r, false))}
          empty="No orders for this customer yet."
          allHref={`/orders?q=${q}`}
        />
      ) : null}
      {can(role, 'invoice:read') ? (
        <RelatedTable
          title="Invoices"
          count={data.invoices.count}
          columns={INVOICE_COLS}
          rows={data.invoices.rows.map(invoiceRow)}
          empty="No invoices for this customer yet."
          allHref={`/invoices?q=${q}`}
        />
      ) : null}
      {can(role, 'payment:read') ? (
        <RelatedTable
          title="Payments"
          count={data.payments.count}
          columns={[
            { label: 'Receipt' },
            { label: 'Date' },
            { label: 'Mode' },
            { label: 'Amount', align: 'right' },
          ]}
          rows={data.payments.rows.map((r) => ({
            key: r.id,
            href: `/payments/${r.id}`,
            cells: [r.number, fmtDate(r.paidOn), PAYMENT_MODE_LABELS[r.mode], money(r.amount)],
          }))}
          empty="No payments received from this customer yet."
          allHref={`/payments?q=${q}`}
        />
      ) : null}
      {FEATURES.notes && can(role, 'note:read') ? (
        <RelatedTable
          title="Credit & debit notes"
          count={data.notes.count}
          columns={NOTE_COLS}
          rows={data.notes.rows.map(noteRow)}
          empty="No credit or debit notes for this customer."
        />
      ) : null}
    </>
  )
}

export function CustomerRelated(props: { id: string; name: string; role: UserRole }) {
  return (
    <Wrap>
      <CustomerBody {...props} />
    </Wrap>
  )
}

async function PartnerBody({ id, role }: { id: string; role: UserRole }) {
  const data = await partnerRelated(id)

  return (
    <>
      {can(role, 'customer:read') ? (
        <RelatedTable
          title="Customers who prefer them"
          count={data.customers.count}
          columns={[
            { label: 'Code' },
            { label: 'Name' },
            { label: 'Phone' },
            { label: 'City' },
          ]}
          rows={data.customers.rows.map((r) => ({
            key: r.id,
            href: `/customers/${r.id}`,
            cells: [r.code, r.name, r.phone, r.city ?? '—'],
          }))}
          empty="No customers list this partner as preferred."
        />
      ) : null}
      {can(role, 'quotation:read') ? (
        <RelatedTable
          title="Quotations"
          count={data.quotations.count}
          columns={QUOTE_COLS(true)}
          rows={data.quotations.rows.map((r) => quotationRow(r, true))}
          empty="No quotations reference this partner."
        />
      ) : null}
      {can(role, 'order:read') ? (
        <RelatedTable
          title="Orders"
          count={data.orders.count}
          columns={ORDER_COLS(true)}
          rows={data.orders.rows.map((r) => orderRow(r, true))}
          empty="No orders reference this partner."
        />
      ) : null}
    </>
  )
}

export function PartnerRelated(props: { id: string; role: UserRole }) {
  return (
    <Wrap>
      <PartnerBody {...props} />
    </Wrap>
  )
}

async function ItemBody({ id, role }: { id: string; role: UserRole }) {
  const data = await itemRelated(id)
  const cols = (dateLabel: string) => [
    { label: 'Number' },
    { label: 'Customer' },
    { label: dateLabel },
    { label: 'Status' },
    { label: 'Qty', align: 'right' as const },
    { label: 'Rate', align: 'right' as const },
  ]

  return (
    <>
      {can(role, 'quotation:read') ? (
        <RelatedTable
          title="Used in quotations"
          count={data.quotations.count}
          columns={cols('Date')}
          rows={data.quotations.rows.map((r) => ({
            key: r.id,
            href: `/quotations/${r.quotation.id}`,
            cells: [
              r.quotation.number,
              r.quotation.customer.name,
              fmtDate(r.quotation.quotationDate),
              <StatusBadge
                key="s"
                label={QUOTATION_STATUS_LABELS[r.quotation.status]}
                color={QUOTATION_STATUS_COLORS[r.quotation.status]}
              />,
              r.quantity,
              money(r.rate),
            ],
          }))}
          empty="Not used in any quotation yet."
        />
      ) : null}
      {can(role, 'order:read') ? (
        <RelatedTable
          title="Used in orders"
          count={data.orders.count}
          columns={cols('Ordered')}
          rows={data.orders.rows.map((r) => ({
            key: r.id,
            href: `/orders/${r.order.id}`,
            cells: [
              r.order.number,
              r.order.customer.name,
              fmtDate(r.order.orderDate),
              <StatusBadge
                key="s"
                label={ORDER_STATUS_LABELS[r.order.status]}
                color={ORDER_STATUS_COLORS[r.order.status]}
              />,
              r.quantity,
              money(r.rate),
            ],
          }))}
          empty="Not used in any order yet."
        />
      ) : null}
      {can(role, 'invoice:read') ? (
        <RelatedTable
          title="Used in invoices"
          count={data.invoices.count}
          columns={cols('Date')}
          rows={data.invoices.rows.map((r) => ({
            key: r.id,
            href: `/invoices/${r.invoice.id}`,
            cells: [
              r.invoice.number,
              r.invoice.customer.name,
              fmtDate(r.invoice.invoiceDate),
              <StatusBadge
                key="s"
                label={INVOICE_STATUS_LABELS[r.invoice.status]}
                color={INVOICE_STATUS_COLORS[r.invoice.status]}
              />,
              r.quantity,
              money(r.rate),
            ],
          }))}
          empty="Not used in any invoice yet."
        />
      ) : null}
    </>
  )
}

export function ItemRelated(props: { id: string; role: UserRole }) {
  return (
    <Wrap>
      <ItemBody {...props} />
    </Wrap>
  )
}

async function OrderBody({ id, role }: { id: string; role: UserRole }) {
  const data = await orderRelated(id)

  return (
    <>
      {can(role, 'dispatch:read') ? (
        <RelatedTable
          title="Dispatches"
          count={data.dispatches.length}
          columns={[
            { label: 'Challan' },
            { label: 'Date' },
            { label: 'Vehicle' },
            { label: 'Status' },
          ]}
          rows={data.dispatches.map((r) => ({
            key: r.id,
            href: `/dispatch/${r.id}`,
            cells: [
              r.number,
              fmtDate(r.dispatchDate),
              r.vehicleNumber ?? '—',
              <StatusBadge
                key="s"
                label={DISPATCH_STATUS_LABELS[r.status]}
                color={DISPATCH_STATUS_COLORS[r.status]}
              />,
            ],
          }))}
          empty="Nothing dispatched for this order yet."
        />
      ) : null}
      {can(role, 'invoice:read') ? (
        <RelatedTable
          title="Invoices"
          count={data.invoices.length}
          columns={INVOICE_COLS}
          rows={data.invoices.map(invoiceRow)}
          empty="This order has not been invoiced yet."
        />
      ) : null}
      {can(role, 'expense:read') ? (
        <RelatedTable
          title="Expenses booked to this order"
          count={data.expenses.length}
          columns={[
            { label: 'Number' },
            { label: 'Date' },
            { label: 'Payee' },
            { label: 'Total', align: 'right' },
          ]}
          rows={data.expenses.map((r) => ({
            key: r.id,
            href: `/expenses/${r.id}`,
            cells: [r.number, fmtDate(r.expenseDate), r.payeeName, money(r.total)],
          }))}
          empty="No expenses booked against this order."
        />
      ) : null}
    </>
  )
}

export function OrderRelated(props: { id: string; role: UserRole }) {
  return (
    <Wrap>
      <OrderBody {...props} />
    </Wrap>
  )
}

async function QuotationBody({
  id,
  parentId,
  role,
}: {
  id: string
  parentId: string | null
  role: UserRole
}) {
  const data = await quotationRelated(id, parentId)

  return (
    <>
      {can(role, 'order:read') ? (
        <RelatedTable
          title="Orders from this quotation"
          count={data.orders.length}
          columns={ORDER_COLS(false)}
          rows={data.orders.map((r) => orderRow(r, false))}
          empty="No order has been created from this quotation."
        />
      ) : null}
      <RelatedTable
        title="Other revisions"
        count={data.revisions.length}
        columns={QUOTE_COLS(false)}
        rows={data.revisions.map((r) => quotationRow(r, false))}
        empty="This is the only version of the quotation."
      />
    </>
  )
}

export function QuotationRelated(props: {
  id: string
  parentId: string | null
  role: UserRole
}) {
  return (
    <Wrap>
      <QuotationBody {...props} />
    </Wrap>
  )
}

async function InvoiceBody({ id, role }: { id: string; role: UserRole }) {
  const data = await invoiceRelated(id)

  return FEATURES.notes && can(role, 'note:read') ? (
    <RelatedTable
      title="Credit & debit notes"
      count={data.notes.length}
      columns={NOTE_COLS}
      rows={data.notes.map(noteRow)}
      empty="No credit or debit notes against this invoice."
    />
  ) : null
}

export function InvoiceRelated(props: { id: string; role: UserRole }) {
  return (
    <Wrap>
      <InvoiceBody {...props} />
    </Wrap>
  )
}
