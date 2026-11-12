import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { can, type Resource } from '@/lib/permissions'
import { toCsv, type CsvCell } from '@/lib/csv'
import { listCustomers } from '@/lib/queries/customers'
import { listQuotations } from '@/lib/queries/quotations'
import { listOrders } from '@/lib/queries/orders'
import { listInvoices } from '@/lib/queries/invoices'
import { listExpenses } from '@/lib/queries/accounting'
import { listPaymentsForExport } from '@/lib/queries/reports'
import {
  CustomerStatus,
  InvoiceStatus,
  OrderStatus,
  QuotationStatus,
} from '@/generated/prisma/enums'

const RESOURCE: Record<string, Resource> = {
  customers: 'customer',
  quotations: 'quotation',
  orders: 'order',
  invoices: 'invoice',
  payments: 'payment',
  expenses: 'expense',
}

function pick<T extends string>(
  allowed: Record<string, T>,
  value: string | null,
): T | undefined {
  return value && value in allowed ? allowed[value] : undefined
}

type Sheet = { headers: string[]; rows: CsvCell[][] }

async function build(
  kind: string,
  search: string | undefined,
  status: string | null,
): Promise<Sheet | null> {
  switch (kind) {
    case 'customers': {
      const rows = await listCustomers({
        search,
        status: pick(CustomerStatus, status),
      })

      return {
        headers: ['Code', 'Name', 'Type', 'Status', 'Phone', 'Email', 'City', 'Architect', 'Carpenter', 'Added on'],
        rows: rows.map((c) => [
          c.code, c.name, c.type, c.status, c.phone, c.email, c.city,
          c.preferredArchitect?.name, c.preferredCarpenter?.name, c.createdAt,
        ]),
      }
    }
    case 'quotations': {
      const rows = await listQuotations({
        search,
        status: pick(QuotationStatus, status),
      })

      return {
        headers: ['Number', 'Revision', 'Status', 'Customer', 'Subject', 'Date', 'Valid until', 'Architect', 'Carpenter', 'Total (INR)'],
        rows: rows.map((q) => [
          q.number, q.revision, q.status, q.customer.name, q.subject,
          q.quotationDate, q.validUntil, q.architect?.name, q.carpenter?.name, q.total,
        ]),
      }
    }
    case 'orders': {
      const rows = await listOrders({
        search,
        status: pick(OrderStatus, status),
      })

      return {
        headers: ['Number', 'Status', 'Customer', 'Subject', 'Order date', 'Due date', 'Quotation', 'Total (INR)', 'Advance (INR)'],
        rows: rows.map((o) => [
          o.number, o.status, o.customer.name, o.subject, o.orderDate,
          o.dueDate, o.quotation?.number, o.total, o.advanceAmount,
        ]),
      }
    }
    case 'invoices': {
      const rows = await listInvoices({
        search,
        status: pick(InvoiceStatus, status),
      })

      return {
        headers: ['Number', 'Status', 'Customer', 'Order', 'Invoice date', 'Due date', 'Total (INR)', 'Paid (INR)', 'Due (INR)', 'Payment state'],
        rows: rows.map((i) => [
          i.number, i.status, i.customer.name, i.order?.number, i.invoiceDate,
          i.dueDate, i.total, i.paid + i.advanceAdjusted, i.due, i.paymentState,
        ]),
      }
    }
    case 'payments': {
      const rows = await listPaymentsForExport({ search })

      return {
        headers: ['Receipt', 'Date', 'Customer', 'Mode', 'Reference', 'Amount (INR)', 'Applied (INR)', 'Invoices'],
        rows: rows.map((p) => [
          p.number, p.paidOn, p.customer, p.mode, p.reference, p.amount, p.allocated, p.invoices,
        ]),
      }
    }
    case 'expenses': {
      const rows = await listExpenses({ search })

      return {
        headers: ['Number', 'Date', 'Payee', 'Category', 'Description', 'Bill no.', 'Order', 'Amount (INR)', 'Tax (INR)', 'Total (INR)', 'Input credit', 'Mode'],
        rows: rows.map((e) => [
          e.number, e.expenseDate, e.payeeName, e.category?.name, e.description,
          e.billNumber, e.order?.number, e.amount, e.taxAmount, e.total,
          e.isInputCredit ? 'Yes' : 'No', e.paymentMode,
        ]),
      }
    }
    default:
      return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params
  const resource = RESOURCE[kind]

  if (!resource) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 })
  }

  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!can(user.role, `${resource}:read`)) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('q')?.trim() || undefined
  const sheet = await build(kind, search, searchParams.get('status'))

  if (!sheet) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 })
  }

  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(toCsv(sheet.headers, sheet.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
