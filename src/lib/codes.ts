import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { NoteKind, PartnerType } from '@/generated/prisma/enums'

/** Each kind of number: its counter key and the letters it starts with. */
const KINDS = {
  customer: 'CUST',
  item: 'ITM',
  quotation: 'QUO',
  order: 'ORD',
  dispatch: 'DC',
  invoice: 'INV',
  payment: 'PAY',
  expense: 'EXP',
  CREDIT: 'CN',
  DEBIT: 'DN',
  ARCHITECT: 'ARC',
  CARPENTER: 'CAR',
} as const

/**
 * The next number for the active company. Every company counts on its own, so
 * one company's invoices run INV-0001, INV-0002 whatever the others issue. The
 * increment is a single statement, so two people saving at once never share a
 * number.
 */
async function nextValue(key: keyof typeof KINDS) {
  const companyId = await requireCompanyId()

  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO document_counters (company_id, key, value)
    VALUES (${companyId}, ${key}, 1)
    ON CONFLICT (company_id, key)
    DO UPDATE SET value = document_counters.value + 1
    RETURNING value
  `

  return rows[0].value
}

async function next(key: keyof typeof KINDS) {
  const value = await nextValue(key)

  return `${KINDS[key]}-${String(value).padStart(4, '0')}`
}

export const nextCustomerCode = () => next('customer')
export const nextItemCode = () => next('item')
export const nextQuotationNumber = () => next('quotation')
export const nextOrderNumber = () => next('order')
export const nextDispatchNumber = () => next('dispatch')
export const nextInvoiceNumber = () => next('invoice')
export const nextPaymentNumber = () => next('payment')
export const nextExpenseNumber = () => next('expense')
export const nextNoteNumber = (kind: NoteKind) => next(kind)
export const nextPartnerCode = (type: PartnerType) => next(type)
