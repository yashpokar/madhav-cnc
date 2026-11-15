// Pure invoice rules (no database): totals for saving, the state rules for
// editing / status changes / deleting, and what is still outstanding. The
// invoice service and the tests share these.

import { documentTotals, lineTotals, splitGst } from '@/lib/pricing'
import type { InvoiceData } from '@/lib/validation/invoices'
import type { InvoiceStatus } from '@/generated/prisma/enums'

export const round2 = (value: number) => Math.round(value * 100) / 100

/** The document and per-line amounts as they are stored on the invoice. */
export function buildPersistable(data: InvoiceData) {
  const totals = documentTotals({
    lines: data.lines,
    discountType: data.discountType,
    discountValue: data.discountValue,
    transportCharge: data.transportCharge,
    transportTaxRatePercent: data.transportTaxRatePercent,
  })

  const documentSplit = splitGst(totals.taxAmount, data.isInterState)

  const discountRatio =
    totals.subtotal === 0 ? 0 : totals.discountAmount / totals.subtotal

  const lines = data.lines.map((line, index) => {
    const computed = lineTotals(line)
    const lineTax = computed.taxAmount * (1 - discountRatio)
    const split = splitGst(lineTax, data.isInterState)

    return {
      position: index + 1,
      itemId: line.itemId,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      materialName: line.materialName,
      materialSupply: line.materialSupply,
      sizeText: line.sizeText,
      specText: line.specText,
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent,
      taxRatePercent: line.taxRatePercent,
      amount: computed.amount,
      cgstAmount: split.cgst,
      sgstAmount: split.sgst,
      igstAmount: split.igst,
      lineTotal: Math.round((computed.amount + split.total) * 100) / 100,
    }
  })

  return {
    totals: {
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: documentSplit.cgst,
      sgstAmount: documentSplit.sgst,
      igstAmount: documentSplit.igst,
      taxAmount: totals.taxAmount,
      roundOff: totals.roundOff,
      total: totals.total,
    },
    lines,
  }
}

/** What is still owed: total less advance, payments and write-offs. */
export function outstandingOf(invoice: {
  total: number
  advanceAdjusted: number
  paid: number
  writtenOff: number
}) {
  return invoice.total - invoice.advanceAdjusted - invoice.paid - invoice.writtenOff
}

/** Whether an amount fits in what is outstanding (half a paisa of slack). */
export function exceedsOutstanding(amount: number, due: number) {
  return amount > due + 0.005
}

export const outstandingMessage = (due: number) =>
  `Only ₹${round2(due)} is outstanding on this invoice`

/** Why an invoice cannot be edited, or null when it can (drafts only). */
export function editBlock(status: InvoiceStatus): string | null {
  return status === 'DRAFT'
    ? null
    : 'An issued invoice cannot be edited. Cancel it and raise a new one instead.'
}

/** Why the invoice cannot move to `to`, or null when it can. */
export function statusChangeBlock(
  from: InvoiceStatus,
  to: InvoiceStatus,
  allocationCount: number,
): string | null {
  if (from === to) return `Already ${to.toLowerCase()}`

  if (to === 'DRAFT' && allocationCount > 0) {
    return 'Payments are recorded against this invoice, so it cannot go back to draft'
  }

  if (to === 'CANCELLED' && allocationCount > 0) {
    return 'Remove the recorded payments before cancelling this invoice'
  }

  return null
}

/** Why the invoice cannot be deleted, or null when it can. */
export function deleteBlock(counts: {
  paymentAllocations: number
  creditDebitNotes: number
}): string | null {
  if (counts.paymentAllocations > 0) {
    return 'Payments are applied to this invoice. Unapply them first.'
  }

  if (counts.creditDebitNotes > 0) {
    return 'Credit or debit notes refer to this invoice. Delete those first.'
  }

  return null
}
