'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextInvoiceNumber, nextPaymentNumber } from '@/lib/codes'
import { documentTotals, lineTotals, splitGst, sameState } from '@/lib/pricing'
import {
  invoiceInputSchema,
  paymentInputSchema,
  writeOffInputSchema,
} from '@/lib/validation/invoices'
import type { InvoiceData } from '@/lib/validation/invoices'
import { logActivity } from '@/lib/activity'
import { PAYMENT_MODE_LABELS, WRITE_OFF_REASON_LABELS } from '@/lib/labels'
import { detailsFromOrderLine } from '@/lib/line-details'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { InvoiceStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

const inr = new Intl.NumberFormat('en-IN')

const actorOf = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
})

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return invoiceInputSchema.safeParse({
    customerId: formData.get('customerId'),
    orderId: formData.get('orderId'),
    invoiceDate: formData.get('invoiceDate'),
    dueDate: formData.get('dueDate'),
    status: formData.get('status') ?? undefined,
    placeOfSupply: formData.get('placeOfSupply'),
    isInterState: formData.get('isInterState') === 'true',
    billingAddress: formData.get('billingAddress'),
    customerGstin: formData.get('customerGstin'),
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    transportCharge: formData.get('transportCharge') || 0,
    transportTaxRatePercent: formData.get('transportTaxRatePercent') || 0,
    advanceAdjusted: formData.get('advanceAdjusted') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

function buildPersistable(data: InvoiceData) {
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

async function persistInvoice(data: InvoiceData, userId: string) {
  const { totals, lines } = buildPersistable(data)
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

export async function createInvoice(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('invoice:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true },
  })

  if (!customer) {
    return { status: 'error', message: 'Customer not found' }
  }

  const invoice = await persistInvoice(parsed.data, user.id)

  await logActivity({
    entity: 'invoice',
    id: invoice.id,
    action: 'created',
    summary: 'created the invoice',
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  redirect(`/invoices/${invoice.id}?created=1`)
}

export async function updateInvoice(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('invoice:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: {
      status: true,
      _count: { select: { paymentAllocations: true } },
    },
  })

  if (!existing) {
    return { status: 'error', message: 'Invoice not found' }
  }

  if (existing.status !== 'DRAFT') {
    return {
      status: 'error',
      message:
        'An issued invoice cannot be edited. Cancel it and raise a new one instead.',
    }
  }

  const { totals, lines } = buildPersistable(parsed.data)

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id },
      data: {
        orderId: parsed.data.orderId,
        customerId: parsed.data.customerId,
        invoiceDate: parsed.data.invoiceDate,
        dueDate: parsed.data.dueDate,
        placeOfSupply: parsed.data.placeOfSupply,
        isInterState: parsed.data.isInterState,
        billingAddress: parsed.data.billingAddress,
        customerGstin: parsed.data.customerGstin,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        transportCharge: parsed.data.transportCharge,
        transportTaxRatePercent: parsed.data.transportTaxRatePercent,
        advanceAdjusted: parsed.data.advanceAdjusted,
        notes: parsed.data.notes,
        terms: parsed.data.terms,
        ...totals,
        updatedById: user.id,
        lines: { create: lines },
      },
    }),
  ])

  await logActivity({
    entity: 'invoice',
    id,
    action: 'updated',
    summary: 'edited the invoice',
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)

  return { status: 'success', message: 'Invoice saved', id }
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')

  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: {
      status: true,
      number: true,
      _count: { select: { paymentAllocations: true } },
    },
  })

  if (!existing) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (existing.status === status) {
    return { ok: false, error: `Already ${status.toLowerCase()}` }
  }

  if (status === 'DRAFT' && existing._count.paymentAllocations > 0) {
    return {
      ok: false,
      error: 'Payments are recorded against this invoice, so it cannot go back to draft',
    }
  }

  if (status === 'CANCELLED' && existing._count.paymentAllocations > 0) {
    return {
      ok: false,
      error: 'Remove the recorded payments before cancelling this invoice',
    }
  }

  await prisma.invoice.update({
    where: { id },
    data: { status, updatedById: user.id },
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
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

export async function recordPayment(
  invoiceId: string,
  input: {
    amount: string
    mode: string
    reference?: string
    paidOn: string
    notes?: string
  },
): Promise<SimpleResult> {
  const user = await requireCapability('payment:create')

  const invoice = await prisma.invoice.findUnique({
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

  if (!invoice) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (invoice.status !== 'ISSUED') {
    return {
      ok: false,
      error: 'Only an issued invoice can take payments',
    }
  }

  const parsed = paymentInputSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const alreadyPaid = invoice.paymentAllocations.reduce(
    (sum, allocation) => sum + allocation.amount.toNumber(),
    0,
  )
  const writtenOff = invoice.writeOffs.reduce(
    (sum, row) => sum + row.amount.toNumber(),
    0,
  )
  const due =
    invoice.total.toNumber() -
    invoice.advanceAdjusted.toNumber() -
    alreadyPaid -
    writtenOff

  if (parsed.data.amount > due + 0.005) {
    return {
      ok: false,
      error: `Only ₹${Math.round(due * 100) / 100} is outstanding on this invoice`,
    }
  }

  const number = await nextPaymentNumber()

  const payment = await prisma.payment.create({
    data: {
      number,
      customerId: invoice.customerId,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      reference: parsed.data.reference,
      paidOn: parsed.data.paidOn,
      notes: parsed.data.notes,
      recordedById: user.id,
      allocations: {
        create: [{ invoiceId, amount: parsed.data.amount }],
      },
    },
  })

  const paidText = `₹${inr.format(parsed.data.amount)}`

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'payment',
    summary: `recorded a payment of ${paidText} (${PAYMENT_MODE_LABELS[parsed.data.mode]})`,
    actor: actorOf(user),
  })
  await logActivity({
    entity: 'payment',
    id: payment.id,
    action: 'created',
    summary: `recorded the receipt and applied ${paidText} to an invoice`,
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)

  return { ok: true, message: `Payment ${number} recorded` }
}

export async function removeAllocation(
  allocationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:delete')

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

  if (!allocation) {
    return { ok: false, error: 'Payment not found' }
  }

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
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath('/payments')
  revalidatePath(`/invoices/${allocation.invoiceId}`)

  return {
    ok: true,
    message: lastOne
      ? `${allocation.payment.number} removed`
      : `${allocation.payment.number} unapplied from this invoice and moved back on account`,
  }
}

export async function writeOffInvoice(
  invoiceId: string,
  input: {
    amount: string
    reason: string
    notes?: string
    writtenOffOn: string
  },
): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true,
      total: true,
      advanceAdjusted: true,
      paymentAllocations: { select: { amount: true } },
      writeOffs: { select: { amount: true } },
    },
  })

  if (!invoice) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (invoice.status !== 'ISSUED') {
    return { ok: false, error: 'Only an issued invoice can be written off' }
  }

  const parsed = writeOffInputSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const sum = (rows: { amount: { toNumber: () => number } }[]) =>
    rows.reduce((total, row) => total + row.amount.toNumber(), 0)
  const due =
    invoice.total.toNumber() -
    invoice.advanceAdjusted.toNumber() -
    sum(invoice.paymentAllocations) -
    sum(invoice.writeOffs)

  if (parsed.data.amount > due + 0.005) {
    return {
      ok: false,
      error: `Only ₹${Math.round(due * 100) / 100} is outstanding on this invoice`,
    }
  }

  if (parsed.data.reason === 'OTHER' && !parsed.data.notes) {
    return { ok: false, error: 'Add a note explaining why this is not recoverable' }
  }

  await prisma.invoiceWriteOff.create({
    data: {
      invoiceId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      writtenOffOn: parsed.data.writtenOffOn,
      recordedById: user.id,
    },
  })

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'write-off',
    summary: `wrote off ₹${inr.format(parsed.data.amount)} as not recoverable (${WRITE_OFF_REASON_LABELS[parsed.data.reason]})`,
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/customers')

  return { ok: true, message: 'Marked as not recoverable' }
}

export async function removeWriteOff(writeOffId: string): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')

  const row = await prisma.invoiceWriteOff.findUnique({
    where: { id: writeOffId },
    select: { invoiceId: true, amount: true },
  })

  if (!row) {
    return { ok: false, error: 'Write-off not found' }
  }

  await prisma.invoiceWriteOff.delete({ where: { id: writeOffId } })

  await logActivity({
    entity: 'invoice',
    id: row.invoiceId,
    action: 'write-off',
    summary: `reversed a write-off of ₹${inr.format(row.amount.toNumber())}; it is outstanding again`,
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${row.invoiceId}`)
  revalidatePath('/customers')

  return { ok: true, message: 'Write-off reversed' }
}

export async function suggestInterState(
  customerState: string | null,
): Promise<boolean> {
  const company = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { state: true },
  })

  return !sameState(company?.state ?? null, customerState)
}

export async function duplicateInvoice(id: string): Promise<SimpleResult> {
  const user = await requireCapability('invoice:create')

  const source = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: 'asc' } } },
  })

  if (!source) {
    return { ok: false, error: 'Invoice not found' }
  }

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
      createdById: user.id,
      updatedById: user.id,
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
    actor: actorOf(user),
  })
  await logActivity({
    entity: 'invoice',
    id: source.id,
    action: 'duplicated',
    summary: `duplicated into ${created.number}`,
    actor: actorOf(user),
  })

  revalidatePath('/invoices')

  return {
    ok: true,
    message: `${created.number} created as a copy of ${source.number}`,
    id: created.id,
  }
}

export async function deleteInvoice(id: string): Promise<SimpleResult> {
  const user = await requireCapability('invoice:delete')

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      number: true,
      orderId: true,
      status: true,
      _count: { select: { paymentAllocations: true, creditDebitNotes: true } },
    },
  })

  if (!invoice) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (invoice.status === 'ISSUED') {
    return {
      ok: false,
      error: 'Issued invoices are part of your books. Cancel it instead of deleting.',
    }
  }

  if (invoice._count.paymentAllocations > 0) {
    return {
      ok: false,
      error: 'Payments are applied to this invoice. Unapply them first.',
    }
  }

  if (invoice._count.creditDebitNotes > 0) {
    return {
      ok: false,
      error: 'Credit or debit notes refer to this invoice. Delete those first.',
    }
  }

  await prisma.invoice.delete({ where: { id } })

  if (invoice.orderId) {
    await logActivity({
      entity: 'order',
      id: invoice.orderId,
      action: 'invoice',
      summary: `deleted draft invoice ${invoice.number}`,
      actor: actorOf(user),
    })
  }

  revalidatePath('/invoices')

  return { ok: true, message: `${invoice.number} deleted` }
}

/**
 * One-click draft invoice for a completed order, using the order's lines,
 * discount, transport and advance, and the customer's billing details and
 * payment terms. The draft is opened for review before it is issued.
 */
export async function quickCreateInvoiceFromOrder(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:create')

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

  if (!order) {
    return { ok: false, error: 'Order not found' }
  }

  if (order.status !== 'COMPLETED') {
    return { ok: false, error: 'Mark the order completed before invoicing it' }
  }

  if (order.invoices.length > 0) {
    return {
      ok: false,
      error: `Already invoiced as ${order.invoices.map((invoice) => invoice.number).join(', ')}`,
      }
  }

  const company = await prisma.companySetting.findUnique({
    where: { id: 'default' },
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
    return {
      ok: false,
      error: `Could not build the invoice: ${parsed.error.issues[0].message}. Use New invoice to fix it by hand.`,
    }
  }

  const invoice = await persistInvoice(parsed.data, user.id)

  await logActivity({
    entity: 'invoice',
    id: invoice.id,
    action: 'created',
    summary: `created the invoice from order ${order.number} in one click`,
    actor: actorOf(user),
  })
  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'invoice',
    summary: `created invoice ${invoice.number}`,
    actor: actorOf(user),
  })

  revalidatePath('/invoices')
  revalidatePath(`/orders/${order.id}`)

  return {
    ok: true,
    message: `Draft ${invoice.number} created`,
    id: invoice.id,
  }
}
