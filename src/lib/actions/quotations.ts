'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextQuotationNumber } from '@/lib/codes'
import { copyUpload } from '@/lib/storage'
import { documentTotals, lineTotals } from '@/lib/pricing'
import { quotationInputSchema } from '@/lib/validation/quotations'
import type { QuotationData } from '@/lib/validation/quotations'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import { QuotationStatus } from '@/generated/prisma/enums'

export type { FormState }

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return quotationInputSchema.safeParse({
    customerId: formData.get('customerId'),
    architectId: formData.get('architectId'),
    carpenterId: formData.get('carpenterId'),
    subject: formData.get('subject'),
    quotationDate: formData.get('quotationDate'),
    validUntil: formData.get('validUntil'),
    siteAddress: formData.get('siteAddress'),
    siteCity: formData.get('siteCity'),
    sitePincode: formData.get('sitePincode'),
    status: formData.get('status') ?? undefined,
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    advancePercent: formData.get('advancePercent') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

async function assertReferences(data: QuotationData) {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true },
  })

  if (!customer) {
    return 'Selected customer no longer exists'
  }

  const partnerIds = [data.architectId, data.carpenterId].filter(
    Boolean,
  ) as string[]

  if (partnerIds.length > 0) {
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, type: true },
    })
    const byId = new Map(partners.map((partner) => [partner.id, partner.type]))

    if (data.architectId && byId.get(data.architectId) !== 'ARCHITECT') {
      return 'Selected architect is not an architect'
    }

    if (data.carpenterId && byId.get(data.carpenterId) !== 'CARPENTER') {
      return 'Selected carpenter is not a carpenter'
    }
  }

  return null
}

function buildPersistable(data: QuotationData) {
  const totals = documentTotals({
    lines: data.lines,
    discountType: data.discountType,
    discountValue: data.discountValue,
  })

  const lines = data.lines.map((line, index) => {
    const computed = lineTotals(line)

    return {
      position: index + 1,
      itemId: line.itemId,
      description: line.description,
      unit: line.unit,
      materialSupply: line.materialSupply,
      isFlatRate: line.isFlatRate,
      dimensionUnit: line.dimensionUnit,
      length: line.length,
      width: line.width,
      pieces: line.pieces,
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent,
      taxRatePercent: line.taxRatePercent,
      hsnCode: line.hsnCode,
      amount: computed.amount,
      taxAmount: computed.taxAmount,
      lineTotal: computed.lineTotal,
      notes: line.notes,
    }
  })

  return { totals, lines }
}

export async function createQuotation(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('quotation:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const referenceError = await assertReferences(parsed.data)

  if (referenceError) {
    return { status: 'error', message: referenceError }
  }

  const { totals, lines } = buildPersistable(parsed.data)
  const number = await nextQuotationNumber()

  const quotation = await prisma.quotation.create({
    data: {
      number,
      revision: 1,
      status: parsed.data.status,
      customerId: parsed.data.customerId,
      architectId: parsed.data.architectId,
      carpenterId: parsed.data.carpenterId,
      subject: parsed.data.subject,
      quotationDate: parsed.data.quotationDate,
      validUntil: parsed.data.validUntil,
      siteAddress: parsed.data.siteAddress,
      siteCity: parsed.data.siteCity,
      sitePincode: parsed.data.sitePincode,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      advancePercent: parsed.data.advancePercent,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
      ...totals,
      createdById: user.id,
      updatedById: user.id,
      lines: { create: lines },
    },
  })

  revalidatePath('/quotations')
  redirect(`/quotations/${quotation.id}?created=1`)
}

export async function updateQuotation(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('quotation:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!existing) {
    return { status: 'error', message: 'Quotation not found' }
  }

  if (existing.status === 'CONVERTED') {
    return {
      status: 'error',
      message: 'This quotation has been converted to an order and cannot be edited',
    }
  }

  const referenceError = await assertReferences(parsed.data)

  if (referenceError) {
    return { status: 'error', message: referenceError }
  }

  const { totals, lines } = buildPersistable(parsed.data)

  await prisma.$transaction([
    prisma.quotationLine.deleteMany({ where: { quotationId: id } }),
    prisma.quotation.update({
      where: { id },
      data: {
        status: parsed.data.status,
        customerId: parsed.data.customerId,
        architectId: parsed.data.architectId,
        carpenterId: parsed.data.carpenterId,
          subject: parsed.data.subject,
        quotationDate: parsed.data.quotationDate,
        validUntil: parsed.data.validUntil,
        siteAddress: parsed.data.siteAddress,
        siteCity: parsed.data.siteCity,
        sitePincode: parsed.data.sitePincode,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        advancePercent: parsed.data.advancePercent,
        notes: parsed.data.notes,
        terms: parsed.data.terms,
        ...totals,
        updatedById: user.id,
        lines: { create: lines },
      },
    }),
  ])

  revalidatePath('/quotations')
  revalidatePath(`/quotations/${id}`)

  return { status: 'success', message: 'Quotation saved', id }
}

export type SimpleResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string }

const ALLOWED_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'DRAFT'],
  ACCEPTED: ['CONVERTED', 'SENT'],
  REJECTED: ['SENT'],
  EXPIRED: ['SENT'],
  CONVERTED: [],
}

export async function setQuotationStatus(
  id: string,
  status: QuotationStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')

  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { status: true, number: true, revision: true },
  })

  if (!existing) {
    return { ok: false, error: 'Quotation not found' }
  }

  if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
    return {
      ok: false,
      error: `A ${existing.status.toLowerCase()} quotation cannot move to ${status.toLowerCase()}`,
    }
  }

  await prisma.quotation.update({
    where: { id },
    data: { status, updatedById: user.id },
  })

  revalidatePath('/quotations')
  revalidatePath(`/quotations/${id}`)

  return { ok: true, message: `Marked as ${status.toLowerCase()}` }
}

export async function createRevision(id: string): Promise<SimpleResult> {
  const user = await requireCapability('quotation:create')

  const source = await prisma.quotation.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: 'asc' } },
      attachments: { where: { removedAt: null }, orderBy: { createdAt: 'asc' } },
    },
  })

  if (!source) {
    return { ok: false, error: 'Quotation not found' }
  }

  const latest = await prisma.quotation.findFirst({
    where: { number: source.number },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  })

  const revision = (latest?.revision ?? source.revision) + 1

  const copiedAttachments = []

  for (const attachment of source.attachments) {
    try {
      const storedName = await copyUpload(attachment.storedName)

      copiedAttachments.push({
        fileName: attachment.fileName,
        storedName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        comment: attachment.comment,
        uploadedById: attachment.uploadedById,
      })
    } catch {
      continue
    }
  }

  const created = await prisma.quotation.create({
    data: {
      number: source.number,
      revision,
      status: 'DRAFT',
      parentId: source.parentId ?? source.id,
      customerId: source.customerId,
      architectId: source.architectId,
      carpenterId: source.carpenterId,
      subject: source.subject,
      quotationDate: new Date(),
      validUntil: source.validUntil,
      siteAddress: source.siteAddress,
      siteCity: source.siteCity,
      sitePincode: source.sitePincode,
      discountType: source.discountType,
      discountValue: source.discountValue,
      advancePercent: source.advancePercent,
      subtotal: source.subtotal,
      discountAmount: source.discountAmount,
      taxableAmount: source.taxableAmount,
      taxAmount: source.taxAmount,
      roundOff: source.roundOff,
      total: source.total,
      notes: source.notes,
      terms: source.terms,
      createdById: user.id,
      updatedById: user.id,
      attachments: { create: copiedAttachments },
      lines: {
        create: source.lines.map((line) => ({
          position: line.position,
          itemId: line.itemId,
          description: line.description,
          unit: line.unit,
          dimensionUnit: line.dimensionUnit,
          length: line.length,
          width: line.width,
          pieces: line.pieces,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
          hsnCode: line.hsnCode,
          amount: line.amount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          notes: line.notes,
        })),
      },
    },
  })

  revalidatePath('/quotations')

  return {
    ok: true,
    message: `Revision ${revision} created`,
    id: created.id,
  }
}
