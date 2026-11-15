import { prisma } from '@/lib/prisma'
import { paymentState } from '@/lib/queries/invoices'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

/** Tokens are 32 characters; anything else cannot be one of ours. */
function plausible(token: string) {
  return Boolean(token) && token.length >= 20 && token.length <= 128
}

/**
 * What the customer may see of an invoice, found by its link token. Selects
 * only customer-facing fields: no internal notes, activity, creator, write-offs
 * or individual payment records. Only issued invoices are found (draft and
 * cancelled ones are not). There is no session here, so company scoping does
 * not filter this query; the token alone picks the invoice.
 */
export async function getSharedInvoiceByToken(token: string) {
  if (!plausible(token)) {
    return null
  }

  const invoice = await prisma.invoice.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      companyId: true,
      number: true,
      status: true,
      invoiceDate: true,
      dueDate: true,
      placeOfSupply: true,
      isInterState: true,
      billingAddress: true,
      customerGstin: true,
      discountAmount: true,
      transportCharge: true,
      subtotal: true,
      taxableAmount: true,
      cgstAmount: true,
      sgstAmount: true,
      igstAmount: true,
      roundOff: true,
      total: true,
      advanceAdjusted: true,
      terms: true,
      customer: { select: { name: true } },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          description: true,
          hsnCode: true,
          unit: true,
          materialName: true,
          materialSupply: true,
          sizeText: true,
          specText: true,
          quantity: true,
          rate: true,
          amount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          lineTotal: true,
        },
      },
      paymentAllocations: { select: { amount: true } },
      writeOffs: { select: { amount: true } },
    },
  })

  if (!invoice || invoice.status !== 'ISSUED') {
    return null
  }

  const total = num(invoice.total)
  const advance = num(invoice.advanceAdjusted)
  const received = invoice.paymentAllocations.reduce(
    (sum, row) => sum + num(row.amount),
    0,
  )
  const writtenOff = invoice.writeOffs.reduce(
    (sum, row) => sum + num(row.amount),
    0,
  )

  return {
    id: invoice.id,
    companyId: invoice.companyId,
    number: invoice.number,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    placeOfSupply: invoice.placeOfSupply,
    isInterState: invoice.isInterState,
    billingAddress: invoice.billingAddress,
    customerGstin: invoice.customerGstin,
    customerName: invoice.customer.name,
    terms: invoice.terms,
    discountAmount: num(invoice.discountAmount),
    transportCharge: num(invoice.transportCharge),
    subtotal: num(invoice.subtotal),
    taxableAmount: num(invoice.taxableAmount),
    cgstAmount: num(invoice.cgstAmount),
    sgstAmount: num(invoice.sgstAmount),
    igstAmount: num(invoice.igstAmount),
    roundOff: num(invoice.roundOff),
    total,
    // Advance and receipts together; a write-off only lowers what is left.
    paid: round(advance + received),
    due: Math.max(0, round(total - advance - received - writtenOff)),
    paymentState: paymentState(total, advance, received, writtenOff),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      materialName: line.materialName,
      materialSupply: line.materialSupply,
      sizeText: line.sizeText,
      specText: line.specText,
      quantity: num(line.quantity),
      rate: num(line.rate),
      amount: num(line.amount),
      cgstAmount: num(line.cgstAmount),
      sgstAmount: num(line.sgstAmount),
      igstAmount: num(line.igstAmount),
      lineTotal: num(line.lineTotal),
    })),
  }
}

export type SharedInvoice = NonNullable<
  Awaited<ReturnType<typeof getSharedInvoiceByToken>>
>

/** The company behind a shareable invoice's link, for serving its logo and QR codes. */
export async function findShareableInvoiceCompany(token: string) {
  if (!plausible(token)) {
    return null
  }

  const invoice = await prisma.invoice.findUnique({
    where: { shareToken: token },
    select: { companyId: true, status: true },
  })

  return invoice && invoice.status === 'ISSUED' ? invoice.companyId : null
}

export async function getInvoiceCompany(companyId: string) {
  return prisma.companySetting.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      companyName: true,
      addressLine: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstin: true,
      pan: true,
      logoStoredName: true,
      signatureStoredName: true,
      stampStoredName: true,
      signatoryName: true,
      signatoryTitle: true,
    },
  })
}
