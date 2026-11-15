// CSV exports shared by the web download route and the mobile API.

import type { Resource } from '@/lib/permissions'
import type { CsvCell } from '@/lib/csv'
import { listCustomers } from '@/lib/queries/customers'
import { listQuotations } from '@/lib/queries/quotations'
import { listOrders } from '@/lib/queries/orders'
import { listInvoices } from '@/lib/queries/invoices'
import { listBills, listPurchaseOrders } from '@/lib/queries/purchases'
import { listVendorPayments } from '@/lib/queries/vendor-payments'
import { listStock } from '@/lib/queries/stock'
import { listExpenses } from '@/lib/queries/accounting'
import { listPaymentsForExport } from '@/lib/queries/reports'
import { detailsText } from '@/lib/payment-methods'
import {
  CustomerStatus,
  InvoiceStatus,
  OrderStatus,
  PurchaseBillStatus,
  PurchaseOrderStatus,
  QuotationStatus,
} from '@/generated/prisma/enums'

export const EXPORT_RESOURCE: Record<string, Resource> = {
  customers: 'customer',
  quotations: 'quotation',
  orders: 'order',
  invoices: 'invoice',
  payments: 'payment',
  expenses: 'expense',
  'purchase-bills': 'purchase',
  'purchase-orders': 'purchase',
  'vendor-payments': 'purchase',
  stock: 'stock',
}

function pick<T extends string>(
  allowed: Record<string, T>,
  value: string | null,
): T | undefined {
  return value && value in allowed ? allowed[value] : undefined
}

export type Sheet = { headers: string[]; rows: CsvCell[][] }

export async function buildSheet(
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
        headers: ['Receipt', 'Date', 'Customer', 'Mode', 'Reference', 'Amount (INR)', 'Applied (INR)', 'Invoices', 'Details'],
        rows: rows.map((p) => [
          p.number, p.paidOn, p.customer, p.modeName ?? p.mode, p.reference, p.amount, p.allocated, p.invoices,
          detailsText(p.mode, p.paymentDetails, 'in'),
        ]),
      }
    }
    case 'expenses': {
      const rows = await listExpenses({ search })

      return {
        headers: ['Number', 'Date', 'Payee', 'Category', 'Description', 'Bill no.', 'Order', 'Amount (INR)', 'Tax (INR)', 'Total (INR)', 'Input credit', 'Mode', 'Reference', 'Details'],
        rows: rows.map((e) => [
          e.number, e.expenseDate, e.payeeName, e.category?.name, e.description,
          e.billNumber, e.order?.number, e.amount, e.taxAmount, e.total,
          e.isInputCredit ? 'Yes' : 'No', e.modeName ?? e.paymentMode,
          e.reference, detailsText(e.paymentMode, e.paymentDetails, 'out'),
        ]),
      }
    }
    case 'purchase-bills': {
      const rows = await listBills({
        search,
        status: pick(PurchaseBillStatus, status),
      })

      return {
        headers: ['Number', 'Status', 'Vendor', 'Vendor bill no.', 'Order', 'Bill date', 'Due date', 'Total (INR)', 'Paid (INR)', 'Balance (INR)', 'Payment status'],
        rows: rows.map((b) => [
          b.number, b.status, b.vendor.name, b.vendorBillNumber, b.po?.number,
          b.billDate, b.dueDate, b.total, b.paid, b.due, b.paymentStatus,
        ]),
      }
    }
    case 'purchase-orders': {
      const rows = await listPurchaseOrders({
        search,
        status: pick(PurchaseOrderStatus, status),
      })

      return {
        headers: ['Number', 'Status', 'Vendor', 'Order date', 'Expected', 'Lines', 'Total (INR)'],
        rows: rows.map((o) => [
          o.number, o.status, o.vendor.name, o.orderDate, o.expectedDate, o.lineCount, o.total,
        ]),
      }
    }
    case 'vendor-payments': {
      const rows = await listVendorPayments({ search })

      return {
        headers: ['Number', 'Date', 'Vendor', 'Mode', 'Reference', 'Applied to', 'Amount (INR)', 'Applied to bills (INR)', 'Applied to opening (INR)', 'Advance (INR)', 'Details'],
        rows: rows.map((p) => [
          p.number, p.paidOn, p.vendor.name, p.modeName ?? p.mode, p.reference,
          p.billNumbers.join(', '), p.amount, p.allocated, p.openingApplied, p.advance,
          detailsText(p.mode, p.paymentDetails, 'out'),
        ]),
      }
    }
    case 'stock': {
      const filter = status === 'low' || status === 'out' || status === 'negative' ? status : 'all'
      const rows = await listStock({ search, filter })

      return {
        headers: ['Code', 'Name', 'Type', 'On hand', 'Average cost', 'Value (INR)', 'Reorder level', 'State'],
        rows: rows.map((r) => [
          r.code, r.name, r.kind, r.onHand, r.averageCost, r.value, r.reorderLevel, r.state,
        ]),
      }
    }
    default:
      return null
  }
}

