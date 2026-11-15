// Quotation business logic as plain functions: no cookies, headers, FormData,
// redirect or revalidatePath. The server actions in src/lib/actions/quotations.ts
// and share.ts are thin adapters (permission check, FormData -> input, result ->
// FormState, revalidate); the mobile API calls these same functions.
//
// Every function runs inside a company scope: the web's active-company cookie
// or the API's X-Company-Id. The scope layer (company-scope.ts) filters each
// query to that company and refuses a write that points at another company's
// row, so none of these takes a companyId from the caller.
//
// Permissions are checked by the caller (web: requireCapability, API: the
// capability in apiRoute). The state rules (locked after conversion, allowed
// status moves, delete blockers) are re-checked here. Activity logging lives
// here so web and API both leave a trail.
//
// Note on numbering: the quotation number comes from the company's counter
// (codes.ts), a single atomic statement that is consumed just before the
// insert. A failed insert wastes a number; it can never duplicate one.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextQuotationNumber } from '@/lib/codes'
import { copyUpload, deleteUpload } from '@/lib/storage'
import { invalidateApproval } from '@/lib/reapproval'
import { documentTotals } from '@/lib/pricing'
import { newShareToken } from '@/lib/share-token'
import { getCompanySetting } from '@/lib/queries/company'
import {
  quotationShareParts,
  type ShareLinkParts,
} from '@/lib/share-links'
import {
  quotationDeleteError,
  quotationEditError,
  quotationTransitionError,
} from '@/lib/sales-rules'
import {
  buildLineRows,
  checkCustomer,
  checkPartners,
  resolveActor,
  type Actor,
  type ServiceResult,
} from '@/lib/services/sales-shared'
import { staffCommentBodySchema, type QuotationData } from '@/lib/validation/quotations'
import type { QuotationStatus } from '@/generated/prisma/enums'

export type { Actor, ServiceResult }
export type { QuotationData as QuotationInput } from '@/lib/validation/quotations'

async function assertReferences(data: QuotationData) {
  return (await checkCustomer(data.customerId)) ?? (await checkPartners(data))
}

function buildPersistable(input: QuotationData) {
  const { lines, rows } = buildLineRows(input.lines)

  const totals = documentTotals({
    lines,
    discountType: input.discountType,
    discountValue: input.discountValue,
  })

  return { totals, lines: rows }
}

function headerFields(data: QuotationData) {
  return {
    status: data.status,
    customerId: data.customerId,
    architectId: data.architectId,
    carpenterId: data.carpenterId,
    subject: data.subject,
    quotationDate: data.quotationDate,
    validUntil: data.validUntil,
    siteAddress: data.siteAddress,
    siteCity: data.siteCity,
    sitePincode: data.sitePincode,
    discountType: data.discountType,
    discountValue: data.discountValue,
    advancePercent: data.advancePercent,
    notes: data.notes,
    terms: data.terms,
  }
}

/** Creates a quotation (revision 1) with its priced lines. */
export async function createQuotation(
  actor: Actor,
  input: QuotationData,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const referenceError = await assertReferences(input)

  if (referenceError) return { ok: false, error: referenceError }

  const who = await resolveActor(actor)
  const { totals, lines } = buildPersistable(input)
  const number = await nextQuotationNumber()

  const quotation = await prisma.quotation.create({
    data: {
      number,
      revision: 1,
      ...headerFields(input),
      ...totals,
      createdById: who.id,
      updatedById: who.id,
      lines: { create: lines },
    },
  })

  await logActivity({
    entity: 'quotation',
    id: quotation.id,
    action: 'created',
    summary: 'created the quotation',
    actor: who,
  })

  return { ok: true, message: 'Quotation created', id: quotation.id, number }
}

/**
 * Replaces a quotation's header and lines. A converted quotation is locked.
 * Editing clears a customer approval that was already given (the link asks
 * again); `approvalCleared` says so.
 */
export async function updateQuotation(
  actor: Actor,
  id: string,
  input: QuotationData,
): Promise<ServiceResult<{ id: string; approvalCleared: boolean }>> {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!existing) return { ok: false, error: 'Quotation not found' }

  const locked = quotationEditError(existing.status)

  if (locked) return { ok: false, error: locked }

  const referenceError = await assertReferences(input)

  if (referenceError) return { ok: false, error: referenceError }

  const who = await resolveActor(actor)
  const { totals, lines } = buildPersistable(input)

  await prisma.$transaction([
    prisma.quotationLine.deleteMany({ where: { quotationId: id } }),
    prisma.quotation.update({
      where: { id },
      data: {
        ...headerFields(input),
        ...totals,
        updatedById: who.id,
        lines: { create: lines },
      },
    }),
  ])

  const wasApproved = await invalidateApproval(id, 'Quotation amended')

  await logActivity({
    entity: 'quotation',
    id,
    action: 'updated',
    summary: wasApproved
      ? 'edited the quotation (customer approval cleared)'
      : 'edited the quotation',
    actor: who,
  })

  return {
    ok: true,
    message: wasApproved
      ? 'Quotation saved. The customer approval was cleared and the link now asks for approval again.'
      : 'Quotation saved',
    id,
    approvalCleared: wasApproved,
  }
}

/** Moves a quotation along its status table (see sales-rules.ts). */
export async function setQuotationStatus(
  actor: Actor,
  id: string,
  status: QuotationStatus,
): Promise<ServiceResult<{ id: string; status: QuotationStatus }>> {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { status: true, number: true, revision: true },
  })

  if (!existing) return { ok: false, error: 'Quotation not found' }

  const refused = quotationTransitionError(existing.status, status)

  if (refused) return { ok: false, error: refused }

  const who = await resolveActor(actor)

  await prisma.quotation.update({
    where: { id },
    data: { status, updatedById: who.id },
  })

  await logActivity({
    entity: 'quotation',
    id,
    action: 'status',
    summary: `marked the quotation as ${status.toLowerCase()}`,
    actor: who,
  })

  return { ok: true, message: `Marked as ${status.toLowerCase()}`, id, status }
}

/**
 * Copies a quotation into a new draft revision (same number, next revision),
 * including its lines and a copy of each attached file.
 */
export async function createRevision(
  actor: Actor,
  id: string,
): Promise<ServiceResult<{ id: string; revision: number }>> {
  const source = await prisma.quotation.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: 'asc' } },
      attachments: { where: { removedAt: null }, orderBy: { createdAt: 'asc' } },
    },
  })

  if (!source) return { ok: false, error: 'Quotation not found' }

  const who = await resolveActor(actor)

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
      createdById: who.id,
      updatedById: who.id,
      attachments: { create: copiedAttachments },
      lines: {
        create: source.lines.map((line) => ({
          position: line.position,
          itemId: line.itemId,
          description: line.description,
          unit: line.unit,
          materialSupply: line.materialSupply,
          isFlatRate: line.isFlatRate,
          autoSize: line.autoSize,
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

  await logActivity({
    entity: 'quotation',
    id: created.id,
    action: 'created',
    summary: `created revision R${revision} from R${source.revision}`,
    actor: who,
  })
  await logActivity({
    entity: 'quotation',
    id: source.id,
    action: 'revised',
    summary: `created revision R${revision}`,
    actor: who,
  })

  return { ok: true, message: `Revision ${revision} created`, id: created.id, revision }
}

/** Deletes a quotation unless orders or later revisions still point at it. */
export async function deleteQuotation(
  _actor: Actor,
  id: string,
): Promise<ServiceResult<{ number: string }>> {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      number: true,
      status: true,
      attachments: { select: { storedName: true } },
    },
  })

  if (!quotation) return { ok: false, error: 'Quotation not found' }

  const [orders, revisions] = await Promise.all([
    prisma.order.count({ where: { quotationId: id } }),
    prisma.quotation.count({ where: { parentId: id } }),
  ])

  const blocked = quotationDeleteError({ orders, revisions })

  if (blocked) return { ok: false, error: blocked }

  await prisma.quotation.delete({ where: { id } })

  await Promise.all(
    quotation.attachments.map((file) => deleteUpload(file.storedName)),
  )

  return { ok: true, message: `${quotation.number} deleted`, number: quotation.number }
}

export type QuotationShareResult = ServiceResult<
  ShareLinkParts & {
    /** False when an active link already existed and was returned as it is. */
    created: boolean
  }
>

/**
 * The customer link for a quotation: returns the active one, or creates it.
 * `baseUrl` is the public origin the link is built on (the caller passes it:
 * PUBLIC_BASE_URL on the web); null gives a path-only url.
 */
export async function createShareLink(
  actor: Actor,
  quotationId: string,
  baseUrl: string | null,
): Promise<QuotationShareResult> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      number: true,
      customer: { select: { name: true, phone: true } },
    },
  })

  if (!quotation) return { ok: false, error: 'Quotation not found' }

  const company = await getCompanySetting()

  const partsFor = (token: string) =>
    quotationShareParts({
      baseUrl,
      token,
      customerName: quotation.customer.name,
      customerPhone: quotation.customer.phone,
      quotationNumber: quotation.number,
      companyName: company.companyName,
    })

  const existing = await prisma.quotationShare.findFirst({
    where: { quotationId, isRevoked: false },
    select: { id: true, token: true },
  })

  if (existing) {
    return { ok: true, message: 'Link ready', created: false, ...partsFor(existing.token) }
  }

  const who = await resolveActor(actor)

  const share = await prisma.quotationShare.create({
    data: {
      quotationId,
      token: newShareToken(),
      createdById: who.id,
    },
    select: { token: true },
  })

  await logActivity({
    entity: 'quotation',
    id: quotationId,
    action: 'shared',
    summary: 'shared the customer link',
    actor: who,
  })

  return { ok: true, message: 'Share link created', created: true, ...partsFor(share.token) }
}

/** Stops the active customer link from opening. */
export async function revokeShareLink(
  actor: Actor,
  quotationId: string,
): Promise<ServiceResult> {
  const result = await prisma.quotationShare.updateMany({
    where: { quotationId, isRevoked: false },
    data: { isRevoked: true },
  })

  if (result.count === 0) return { ok: false, error: 'No active link to revoke' }

  const who = await resolveActor(actor)

  await logActivity({
    entity: 'quotation',
    id: quotationId,
    action: 'shared',
    summary: 'revoked the customer link',
    actor: who,
  })

  return { ok: true, message: 'Link revoked. It will no longer open.' }
}

/** A staff comment on a quotation (optionally on one of its images). */
export async function addStaffComment(
  actor: Actor,
  quotationId: string,
  body: string,
  attachmentId?: string | null,
): Promise<ServiceResult> {
  const parsed = staffCommentBodySchema.safeParse(body)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const who = await resolveActor(actor)

  await prisma.quotationComment.create({
    data: {
      quotationId,
      attachmentId: attachmentId ?? null,
      body: parsed.data,
      authorType: 'STAFF',
      authorUserId: who.id,
    },
  })

  await logActivity({
    entity: 'quotation',
    id: quotationId,
    action: 'comment',
    summary: 'added a comment',
    actor: who,
  })

  return { ok: true, message: 'Comment added' }
}
