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
} from '@/lib/validation/invoices'
import type { InvoiceData } from '@/lib/validation/invoices'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { InvoiceStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

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

  const { totals, lines } = buildPersistable(parsed.data)
  const number = await nextInvoiceNumber()

  const invoice = await prisma.invoice.create({
    data: {
      number,
      status: parsed.data.status,
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
      createdById: user.id,
      updatedById: user.id,
      lines: { create: lines },
    },
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
  const due =
    invoice.total.toNumber() - invoice.advanceAdjusted.toNumber() - alreadyPaid

  if (parsed.data.amount > due + 0.005) {
    return {
      ok: false,
      error: `Only ₹${Math.round(due * 100) / 100} is outstanding on this invoice`,
    }
  }

  const number = await nextPaymentNumber()

  await prisma.payment.create({
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

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)

  return { ok: true, message: `Payment ${number} recorded` }
}

export async function removeAllocation(
  allocationId: string,
): Promise<SimpleResult> {
  await requireCapability('payment:delete')

  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: allocationId },
    select: {
      invoiceId: true,
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

  revalidatePath('/invoices')

  return {
    ok: true,
    message: `${created.number} created as a copy of ${source.number}`,
    id: created.id,
  }
}
