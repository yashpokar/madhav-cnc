// Invoice writes, as plain functions that take the acting user ({ id, name })
// and plain typed input, so the web server actions and the mobile API call the
// very same code. No cookies, headers, redirects, revalidatePath or FormData in
// here; the server actions are thin adapters (capability check, FormData ->
// zod, call, map the result to a FormState / toast, revalidate, redirect).
//
// Everything runs INSIDE A COMPANY SCOPE: the active company comes from the
// web cookie or the API's X-Company-Id header, and the scope layer
// (company-scope.ts) filters every read and write by it. No function here takes
// a companyId from its caller, and a customer, order, item or payment mode of
// another company simply is not found.
//
// Permission checks stay with the caller (web: requireCapability; API: the
// capability on apiRoute). These functions re-check the state rules (only a
// draft is editable, payments block cancelling, and so on).
//
// Failures are returned as { ok: false, error, code? } with a message already
// written for a person; the API turns them into DomainErrors with
// unwrapService(result) (code NOT_FOUND / VALIDATION_FAILED / default CONFLICT).
// Input: invoices take the output of invoiceInputSchema (src/lib/validation/
// invoices.ts) and are expected to be parsed by the caller; payment and
// write-off take raw JSON-native input and parse it here.

import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { nextInvoiceNumber, nextPaymentNumber } from '@/lib/codes'
import { resolvePaymentMode } from '@/lib/payment-modes'
import { logActivity } from '@/lib/activity'
import { assertCanIssueInvoice } from '@/lib/billing/guard'
import { WRITE_OFF_REASON_LABELS } from '@/lib/labels'
import { detailsFromOrderLine } from '@/lib/line-details'
import { newShareToken } from '@/lib/share-token'
import { sameState } from '@/lib/pricing'
import {
  buildPersistable,
  deleteBlock,
  editBlock,
  exceedsOutstanding,
  outstandingMessage,
  outstandingOf,
  statusChangeBlock,
} from '@/lib/invoice-rules'
import {
  invoiceInputSchema,
  paymentInputSchema,
  writeOffInputSchema,
  type InvoiceData,
  type PaymentInput,
  type WriteOffInput,
} from '@/lib/validation/invoices'
import type { InvoiceStatus } from '@/generated/prisma/enums'

export type Actor = { id: string; name: string }

export type FailureCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED'

export type Failure = { ok: false; error: string; code?: FailureCode }

export type ServiceResult<T extends object = object> =
  | ({ ok: true; message: string } & T)
  | Failure

const inr = new Intl.NumberFormat('en-IN')

const notFound = (error: string): Failure => ({ ok: false, error, code: 'NOT_FOUND' })
const conflict = (error: string): Failure => ({ ok: false, error, code: 'CONFLICT' })
const invalid = (error: string): Failure => ({
  ok: false,
  error,
  code: 'VALIDATION_FAILED',
})

type Tx = Pick<typeof prisma, '$queryRaw' | 'invoice' | 'payment' | 'invoiceWriteOff'>

const sum = (rows: { amount: { toNumber: () => number } }[]) =>
  rows.reduce((total, row) => total + row.amount.toNumber(), 0)

/** Serialises everything that spends this invoice's outstanding amount. */
async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`
}

async function persistInvoice(data: InvoiceData, userId: string) {
  const { totals, lines } = buildPersistable(data)
  // The counter is one atomic statement on its own; the invoice and its lines
  // are then one nested create, so a number is never attached to half an invoice.
  const number = await nextInvoiceNumber()

  return prisma.invoice.create({
    data: {
      number,
      status: data.status,
      orderId: data.orderId,
      customerId: data.customerId,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      placeOfSupply: data.placeOfSupply,
      isInterState: data.isInterState,
      billingAddress: data.billingAddress,
      customerGstin: data.customerGstin,
      discountType: data.discountType,
      discountValue: data.discountValue,
      transportCharge: data.transportCharge,
      transportTaxRatePercent: data.transportTaxRatePercent,
      advanceAdjusted: data.advanceAdjusted,
      notes: data.notes,
      terms: data.terms,
      ...totals,
      createdById: userId,
      updatedById: userId,
      lines: { create: lines },
    },
  })
}

/** Whether a sale to a customer in this state is inter-state for the active company. */
export async function suggestInterState(customerState: string | null): Promise<boolean> {
  const company = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { state: true },
  })

  return !sameState(company?.state ?? null, customerState)
}

export async function createInvoice(
  actor: Actor,
  data: InvoiceData,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true },
  })

  if (!customer) return notFound('Customer not found')

  // An invoice created directly as ISSUED takes a slot of the plan's quota.
  if (data.status === 'ISSUED') await assertCanIssueInvoice(await requireCompanyId())

  const invoice = await persistInvoice(data, actor.id)

  await logActivity({
    entity: 'invoice',
    id: invoice.id,
    action: 'created',
    summary: 'created the invoice',
    actor,
  })

  return {
    ok: true,
    message: `${invoice.number} created`,
    id: invoice.id,
    number: invoice.number,
  }
}

/** Replaces a draft's header and lines. Issued invoices are not editable. */
export async function updateInvoice(
  actor: Actor,
  id: string,
  data: InvoiceData,
): Promise<ServiceResult<{ id: string }>> {
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) return notFound('Invoice not found')

  const blocked = editBlock(existing.status)

  if (blocked) return conflict(blocked)

  const { totals, lines } = buildPersistable(data)

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id },
      data: {
        orderId: data.orderId,
        customerId: data.customerId,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        placeOfSupply: data.placeOfSupply,
        isInterState: data.isInterState,
        billingAddress: data.billingAddress,
        customerGstin: data.customerGstin,
        discountType: data.discountType,
        discountValue: data.discountValue,
        transportCharge: data.transportCharge,
        transportTaxRatePercent: data.transportTaxRatePercent,
        advanceAdjusted: data.advanceAdjusted,
        notes: data.notes,
        terms: data.terms,
        ...totals,
        updatedById: actor.id,
        lines: { create: lines },
      },
    }),
  ])

  await logActivity({
    entity: 'invoice',
    id,
    action: 'updated',
    summary: 'edited the invoice',
    actor,
  })

  return { ok: true, message: 'Invoice saved', id }
}

/** Issue, cancel or move back to draft. */
export async function changeInvoiceStatus(
  actor: Actor,
  id: string,
  status: InvoiceStatus,
): Promise<ServiceResult> {
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: {
      status: true,
      number: true,
      issuedAt: true,
      _count: { select: { paymentAllocations: true } },
    },
  })

  if (!existing) return notFound('Invoice not found')

  const blocked = statusChangeBlock(
    existing.status,
    status,
    existing._count.paymentAllocations,
  )

  if (blocked) return conflict(blocked)

  // DRAFT -> ISSUED uses one of the plan's invoices. A draft that was issued
  // before (and moved back) already holds its slot, so it is never refused.
  // Cancelling, editing and everything else is never guarded.
  if (status === 'ISSUED' && existing.status === 'DRAFT' && !existing.issuedAt) {
    await assertCanIssueInvoice(await requireCompanyId())
  }

  await prisma.invoice.update({
    where: { id },
    data: { status, updatedById: actor.id },
  })

  await logActivity({
    entity: 'invoice',
    id,
    action: 'status',
    summary:
      status === 'ISSUED'
        ? 'issued the invoice'
        : status === 'CANCELLED'
          ? 'cancelled the invoice'
          : 'moved the invoice back to draft',
    actor,
  })

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

/**
 * Records a receipt against one issued invoice. The "does it fit what is
 * outstanding" check and the insert run in one transaction that locks the
 * invoice row, so two payments cannot both spend the same outstanding amount.
 */
export async function recordInvoicePayment(
  actor: Actor,
  invoiceId: string,
  input: PaymentInput,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const head = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!head) return notFound('Invoice not found')

  if (head.status !== 'ISSUED') return conflict('Only an issued invoice can take payments')

  const parsed = paymentInputSchema.safeParse(input)

  if (!parsed.success) return invalid(parsed.error.issues[0].message)

  const data = parsed.data

  const outcome = await prisma.$transaction(async (tx) => {
    await lockInvoice(tx, invoiceId)

    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        total: true,
        customerId: true,
        advanceAdjusted: true,
        paymentAllocations: { select: { amount: true } },
        writeOffs: { select: { amount: true } },
      },
    })

    if (!invoice) return notFound('Invoice not found')

    if (invoice.status !== 'ISSUED') return conflict('Only an issued invoice can take payments')

    const due = outstandingOf({
      total: invoice.total.toNumber(),
      advanceAdjusted: invoice.advanceAdjusted.toNumber(),
      paid: sum(invoice.paymentAllocations),
      writtenOff: sum(invoice.writeOffs),
    })

    if (exceedsOutstanding(data.amount, due)) return conflict(outstandingMessage(due))

    const method = await resolvePaymentMode(data.channelId)

    if (!method) return invalid('Choose a payment mode')

    const number = await nextPaymentNumber()

    const payment = await tx.payment.create({
      data: {
        number,
        customerId: invoice.customerId,
        amount: data.amount,
        mode: method.mode,
        channelId: method.channelId,
        modeName: method.modeName,
        reference: data.reference,
        paidOn: data.paidOn,
        notes: data.notes,
        recordedById: actor.id,
        allocations: {
          create: [{ invoiceId, amount: data.amount }],
        },
      },
    })

    return { ok: true as const, payment, number, method }
  })

  if (!outcome.ok) return outcome

  const paidText = `₹${inr.format(data.amount)}`

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'payment',
    summary: `recorded a payment of ${paidText} (${outcome.method.modeName})`,
    actor,
  })
  await logActivity({
    entity: 'payment',
    id: outcome.payment.id,
    action: 'created',
    summary: `recorded the receipt and applied ${paidText} to an invoice`,
    actor,
  })

  return {
    ok: true,
    message: `Payment ${outcome.number} recorded`,
    id: outcome.payment.id,
    number: outcome.number,
  }
}

/** Unapplies a payment from its invoice; the last allocation removes the receipt. */
export async function removePaymentAllocation(
  actor: Actor,
  allocationId: string,
): Promise<ServiceResult<{ invoiceId: string }>> {
  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: allocationId },
    select: {
      invoiceId: true,
      amount: true,
      payment: {
        select: { id: true, number: true, _count: { select: { allocations: true } } },
      },
    },
  })

  if (!allocation) return notFound('Payment not found')

  const lastOne = allocation.payment._count.allocations === 1

  if (lastOne) {
    await prisma.payment.delete({ where: { id: allocation.payment.id } })
  } else {
    await prisma.paymentAllocation.delete({ where: { id: allocationId } })
  }

  await logActivity({
    entity: 'invoice',
    id: allocation.invoiceId,
    action: 'payment',
    summary: `unapplied a payment of ₹${inr.format(allocation.amount.toNumber())}`,
    actor,
  })

  return {
    ok: true,
    invoiceId: allocation.invoiceId,
    message: lastOne
      ? `${allocation.payment.number} removed`
      : `${allocation.payment.number} unapplied from this invoice and moved back on account`,
  }
}

/** Marks part of an issued invoice's outstanding amount as not recoverable. */
export async function writeOffInvoice(
  actor: Actor,
  invoiceId: string,
  input: WriteOffInput,
): Promise<ServiceResult<{ id: string }>> {
  const head = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!head) return notFound('Invoice not found')

  if (head.status !== 'ISSUED') return conflict('Only an issued invoice can be written off')

  const parsed = writeOffInputSchema.safeParse(input)

  if (!parsed.success) return invalid(parsed.error.issues[0].message)

  const data = parsed.data

  const outcome = await prisma.$transaction(async (tx) => {
    await lockInvoice(tx, invoiceId)

    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        total: true,
        advanceAdjusted: true,
        paymentAllocations: { select: { amount: true } },
        writeOffs: { select: { amount: true } },
      },
    })

    if (!invoice) return notFound('Invoice not found')

    if (invoice.status !== 'ISSUED') {
      return conflict('Only an issued invoice can be written off')
    }

    const due = outstandingOf({
      total: invoice.total.toNumber(),
      advanceAdjusted: invoice.advanceAdjusted.toNumber(),
      paid: sum(invoice.paymentAllocations),
      writtenOff: sum(invoice.writeOffs),
    })

    if (exceedsOutstanding(data.amount, due)) return conflict(outstandingMessage(due))

    if (data.reason === 'OTHER' && !data.notes) {
      return invalid('Add a note explaining why this is not recoverable')
    }

    const row = await tx.invoiceWriteOff.create({
      data: {
        invoiceId,
        amount: data.amount,
        reason: data.reason,
        notes: data.notes,
        writtenOffOn: data.writtenOffOn,
        recordedById: actor.id,
      },
    })

    return { ok: true as const, id: row.id }
  })

  if (!outcome.ok) return outcome

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'write-off',
    summary: `wrote off ₹${inr.format(data.amount)} as not recoverable (${WRITE_OFF_REASON_LABELS[data.reason]})`,
    actor,
  })

  return { ok: true, message: 'Marked as not recoverable', id: outcome.id }
}

export async function removeWriteOff(
  actor: Actor,
  writeOffId: string,
): Promise<ServiceResult<{ invoiceId: string }>> {
  const row = await prisma.invoiceWriteOff.findUnique({
    where: { id: writeOffId },
    select: { invoiceId: true, amount: true },
  })

  if (!row) return notFound('Write-off not found')

  await prisma.invoiceWriteOff.delete({ where: { id: writeOffId } })

  await logActivity({
    entity: 'invoice',
    id: row.invoiceId,
    action: 'write-off',
    summary: `reversed a write-off of ₹${inr.format(row.amount.toNumber())}; it is outstanding again`,
    actor,
  })

  return { ok: true, message: 'Write-off reversed', invoiceId: row.invoiceId }
}

/** A new draft with the same lines and amounts (no advance, dated today). */
export async function duplicateInvoice(
  actor: Actor,
  id: string,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const source = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: 'asc' } } },
  })

  if (!source) return notFound('Invoice not found')

  const number = await nextInvoiceNumber()

  const created = await prisma.invoice.create({
    data: {
      number,
      status: 'DRAFT',
      orderId: source.orderId,
      customerId: source.customerId,
      invoiceDate: new Date(),
      dueDate: null,
      placeOfSupply: source.placeOfSupply,
      isInterState: source.isInterState,
      billingAddress: source.billingAddress,
      customerGstin: source.customerGstin,
      discountType: source.discountType,
      discountValue: source.discountValue,
      transportCharge: source.transportCharge,
      transportTaxRatePercent: source.transportTaxRatePercent,
      subtotal: source.subtotal,
      discountAmount: source.discountAmount,
      taxableAmount: source.taxableAmount,
      cgstAmount: source.cgstAmount,
      sgstAmount: source.sgstAmount,
      igstAmount: source.igstAmount,
      taxAmount: source.taxAmount,
      roundOff: source.roundOff,
      total: source.total,
      advanceAdjusted: 0,
      notes: source.notes,
      terms: source.terms,
      createdById: actor.id,
      updatedById: actor.id,
      lines: {
        create: source.lines.map((line) => ({
          position: line.position,
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
          amount: line.amount,
          cgstAmount: line.cgstAmount,
          sgstAmount: line.sgstAmount,
          igstAmount: line.igstAmount,
          lineTotal: line.lineTotal,
        })),
      },
    },
  })

  await logActivity({
    entity: 'invoice',
    id: created.id,
    action: 'created',
    summary: `duplicated this invoice from ${source.number}`,
    actor,
  })
  await logActivity({
    entity: 'invoice',
    id: source.id,
    action: 'duplicated',
    summary: `duplicated into ${created.number}`,
    actor,
  })

  return {
    ok: true,
    message: `${created.number} created as a copy of ${source.number}`,
    id: created.id,
    number: created.number,
  }
}

export async function deleteInvoice(actor: Actor, id: string): Promise<ServiceResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      number: true,
      orderId: true,
      status: true,
      _count: { select: { paymentAllocations: true, creditDebitNotes: true } },
    },
  })

  if (!invoice) return notFound('Invoice not found')

  const blocked = deleteBlock(invoice._count)

  if (blocked) return conflict(blocked)

  await prisma.invoice.delete({ where: { id } })

  if (invoice.orderId) {
    await logActivity({
      entity: 'order',
      id: invoice.orderId,
      action: 'invoice',
      summary: `deleted invoice ${invoice.number}`,
      actor,
    })
  }

  return { ok: true, message: `${invoice.number} deleted` }
}

/**
 * One-click draft invoice for a completed order, using the order's lines,
 * discount, transport and advance, and the customer's billing details and
 * payment terms. The draft is opened for review before it is issued.
 */
export async function createInvoiceFromOrder(
  actor: Actor,
  orderId: string,
): Promise<ServiceResult<{ id: string; number: string; orderId: string }>> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      discountType: true,
      discountValue: true,
      transportCharge: true,
      transportTaxRatePercent: true,
      advanceAmount: true,
      terms: true,
      customer: {
        select: {
          id: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          gstin: true,
          paymentTermsDays: true,
        },
      },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          itemId: true,
          description: true,
          hsnCode: true,
          unit: true,
          materialSupply: true,
          dimensionUnit: true,
          length: true,
          width: true,
          pieces: true,
          item: {
            select: {
              brand: true,
              shade: true,
              thickness: true,
              dimensionUnit: true,
              material: { select: { name: true } },
            },
          },
          quantity: true,
          rate: true,
          discountPercent: true,
          taxRatePercent: true,
        },
      },
      invoices: {
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, number: true },
      },
    },
  })

  if (!order) return notFound('Order not found')

  if (order.status !== 'COMPLETED') {
    return conflict('Mark the order completed before invoicing it')
  }

  if (order.invoices.length > 0) {
    return conflict(
      `Already invoiced as ${order.invoices.map((invoice) => invoice.number).join(', ')}`,
    )
  }

  const company = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { invoiceTerms: true },
  })

  const today = new Date()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  const termsDays = order.customer.paymentTermsDays

  const parsed = invoiceInputSchema.safeParse({
    customerId: order.customer.id,
    orderId: order.id,
    invoiceDate: iso(today),
    dueDate: termsDays
      ? iso(new Date(today.getTime() + termsDays * 86_400_000))
      : '',
    status: 'DRAFT',
    placeOfSupply: order.customer.state ?? '',
    isInterState: await suggestInterState(order.customer.state),
    billingAddress: [
      order.customer.address,
      order.customer.city,
      order.customer.pincode,
    ]
      .filter(Boolean)
      .join(', '),
    customerGstin: order.customer.gstin ?? '',
    discountType: order.discountType,
    discountValue: order.discountValue.toNumber(),
    transportCharge: order.transportCharge.toNumber(),
    transportTaxRatePercent: order.transportTaxRatePercent.toNumber(),
    advanceAdjusted: order.advanceAmount.toNumber(),
    notes: '',
    terms: order.terms ?? company?.invoiceTerms ?? '',
    lines: order.lines.map((line) => ({
      itemId: line.itemId ?? '',
      description: line.description,
      hsnCode: line.hsnCode ?? '',
      unit: line.unit,
      ...detailsFromOrderLine(line),
      quantity: line.quantity.toNumber(),
      rate: line.rate.toNumber(),
      discountPercent: line.discountPercent.toNumber(),
      taxRatePercent: line.taxRatePercent.toNumber(),
    })),
  })

  if (!parsed.success) {
    return invalid(
      `Could not build the invoice: ${parsed.error.issues[0].message}. Use New invoice to fix it by hand.`,
    )
  }

  const invoice = await persistInvoice(parsed.data, actor.id)

  await logActivity({
    entity: 'invoice',
    id: invoice.id,
    action: 'created',
    summary: `created the invoice from order ${order.number} in one click`,
    actor,
  })
  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'invoice',
    summary: `created invoice ${invoice.number}`,
    actor,
  })

  return {
    ok: true,
    message: `Draft ${invoice.number} created`,
    id: invoice.id,
    number: invoice.number,
    orderId: order.id,
  }
}

/**
 * The customer link for an issued invoice, made on first use. `token` is the
 * link's secret; `created` is false when a link already existed.
 */
export async function ensureInvoiceShareLink(
  actor: Actor,
  invoiceId: string,
): Promise<ServiceResult<{ token: string; created: boolean }>> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, shareToken: true },
  })

  if (!invoice) return notFound('Invoice not found')

  if (invoice.status !== 'ISSUED') return conflict('Only an issued invoice can be shared')

  if (invoice.shareToken) {
    return { ok: true, message: 'Link ready', token: invoice.shareToken, created: false }
  }

  const token = newShareToken()

  // Only fills an empty slot, so two quick clicks cannot replace each other's link.
  const result = await prisma.invoice.updateMany({
    where: { id: invoiceId, shareToken: null },
    data: { shareToken: token },
  })

  if (result.count === 0) {
    const current = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { shareToken: true },
    })

    return current?.shareToken
      ? { ok: true, message: 'Link ready', token: current.shareToken, created: false }
      : conflict('Could not create the link')
  }

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'shared',
    summary: 'created the customer link',
    actor,
  })

  return { ok: true, message: 'Share link created', token, created: true }
}

/** Replaces the link; the old one stops opening straight away. */
export async function regenerateInvoiceShareLink(
  actor: Actor,
  invoiceId: string,
): Promise<ServiceResult<{ token: string }>> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!invoice) return notFound('Invoice not found')

  if (invoice.status !== 'ISSUED') return conflict('Only an issued invoice can be shared')

  const token = newShareToken()

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { shareToken: token },
  })

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'shared',
    summary: 'regenerated the customer link (the old link no longer opens)',
    actor,
  })

  return {
    ok: true,
    message: 'New link created. The old one no longer opens.',
    token,
  }
}
