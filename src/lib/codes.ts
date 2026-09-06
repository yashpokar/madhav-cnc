import { prisma } from '@/lib/prisma'
import { PartnerType } from '@/generated/prisma/enums'

const SEQUENCES = {
  customer: { sequence: 'customer_code_seq', prefix: 'CUST' },
  item: { sequence: 'item_code_seq', prefix: 'ITM' },
  quotation: { sequence: 'quotation_number_seq', prefix: 'QUO' },
  order: { sequence: 'order_number_seq', prefix: 'ORD' },
  dispatch: { sequence: 'dispatch_number_seq', prefix: 'DC' },
  ARCHITECT: { sequence: 'architect_code_seq', prefix: 'ARC' },
  CARPENTER: { sequence: 'carpenter_code_seq', prefix: 'CAR' },
} as const

async function nextValue(sequence: string) {
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('${sequence}') AS nextval`,
  )

  return Number(rows[0].nextval)
}

export async function nextCustomerCode() {
  const { sequence, prefix } = SEQUENCES.customer
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}

export async function nextItemCode() {
  const { sequence, prefix } = SEQUENCES.item
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}

export async function nextQuotationNumber() {
  const { sequence, prefix } = SEQUENCES.quotation
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}

export async function nextOrderNumber() {
  const { sequence, prefix } = SEQUENCES.order
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}

export async function nextDispatchNumber() {
  const { sequence, prefix } = SEQUENCES.dispatch
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}

export async function nextPartnerCode(type: PartnerType) {
  const { sequence, prefix } = SEQUENCES[type]
  const value = await nextValue(sequence)

  return `${prefix}-${String(value).padStart(4, '0')}`
}
