// Quotation design references (images) as plain functions, shared by the web
// actions and the mobile API. Runs inside a company scope; the permission
// check (quotation:update) stays with the caller.

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { invalidateApproval } from '@/lib/reapproval'

type Actor = { id: string; name: string }
type Result<T extends object = object> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string; code?: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' }

const commentSchema = z
  .string()
  .trim()
  .max(1000, 'Comment is too long')
  .transform((value) => (value ? value : null))

async function assertEditable(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { status: true } })

  if (!quotation) return { error: 'Quotation not found', code: 'NOT_FOUND' as const }

  if (quotation.status === 'CONVERTED') {
    return { error: 'This quotation is confirmed as an order and cannot be changed', code: 'CONFLICT' as const }
  }

  return null
}

export async function setAttachmentComment(attachmentId: string, comment: string): Promise<Result<{ quotationId: string }>> {
  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true },
  })

  if (!attachment) return { ok: false, error: 'Image not found', code: 'NOT_FOUND' }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) return { ok: false, ...locked }

  const parsed = commentSchema.safeParse(comment)

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' }

  await prisma.quotationAttachment.update({ where: { id: attachmentId }, data: { comment: parsed.data } })

  return { ok: true, quotationId: attachment.quotationId, message: 'Comment saved' }
}

export async function removeAttachment(actor: Actor, attachmentId: string): Promise<Result<{ quotationId: string }>> {
  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true, removedAt: true, fileName: true },
  })

  if (!attachment) return { ok: false, error: 'Image not found', code: 'NOT_FOUND' }

  if (attachment.removedAt) return { ok: false, error: 'Already removed', code: 'CONFLICT' }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) return { ok: false, ...locked }

  await prisma.quotationAttachment.update({
    where: { id: attachmentId },
    data: { removedAt: new Date(), removedById: actor.id },
  })

  const wasApproved = await invalidateApproval(attachment.quotationId, 'Design reference removed')

  await logActivity({
    entity: 'quotation',
    id: attachment.quotationId,
    action: 'image',
    summary: wasApproved
      ? `removed the image ${attachment.fileName} (customer approval cleared)`
      : `removed the image ${attachment.fileName}`,
    actor,
  })

  return {
    ok: true,
    quotationId: attachment.quotationId,
    message: wasApproved
      ? `${attachment.fileName} removed. The customer approval was cleared.`
      : `${attachment.fileName} removed from the current set`,
  }
}

export async function restoreAttachment(actor: Actor, attachmentId: string): Promise<Result<{ quotationId: string }>> {
  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true, removedAt: true, fileName: true },
  })

  if (!attachment) return { ok: false, error: 'Image not found', code: 'NOT_FOUND' }

  if (!attachment.removedAt) return { ok: false, error: 'This image is already in the current set', code: 'CONFLICT' }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) return { ok: false, ...locked }

  await prisma.quotationAttachment.update({ where: { id: attachmentId }, data: { removedAt: null, removedById: null } })

  await logActivity({
    entity: 'quotation',
    id: attachment.quotationId,
    action: 'image',
    summary: `restored the image ${attachment.fileName}`,
    actor,
  })

  return { ok: true, quotationId: attachment.quotationId, message: 'Image restored' }
}

/**
 * Adds an image already uploaded with POST /uploads (purpose quotation_attachment) to a
 * quotation, as the web's upload does: clears a customer approval and logs it.
 */
export async function attachUpload(
  actor: Actor,
  quotationId: string,
  uploadId: string,
  input: { fileName?: string | null; comment?: string | null } = {},
): Promise<
  Result<{
    id: string
    fileName: string
    mimeType: string
    sizeBytes: number
    comment: string | null
    approvalCleared: boolean
  }>
> {
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { id: true } })

  if (!quotation) return { ok: false, error: 'Quotation not found', code: 'NOT_FOUND' }

  const locked = await assertEditable(quotationId)

  if (locked) return { ok: false, ...locked }

  const upload = await prisma.upload.findFirst({ where: { id: uploadId, purpose: 'quotation_attachment' } })

  if (!upload) return { ok: false, error: 'Upload not found', code: 'VALIDATION_FAILED' }

  const used = await prisma.quotationAttachment.findFirst({
    where: { storedName: upload.storedName },
    select: { id: true },
  })

  if (used) return { ok: false, error: 'This upload is already attached', code: 'CONFLICT' }

  const comment = commentSchema.safeParse(input.comment ?? '')

  if (!comment.success) return { ok: false, error: comment.error.issues[0].message, code: 'VALIDATION_FAILED' }

  const attachment = await prisma.quotationAttachment.create({
    data: {
      quotationId,
      fileName: input.fileName?.trim() || 'photo',
      storedName: upload.storedName,
      mimeType: upload.mime,
      sizeBytes: upload.size,
      comment: comment.data,
      uploadedById: actor.id,
    },
  })

  await prisma.upload.update({ where: { id: upload.id }, data: { linkedAt: new Date() } })

  const approvalCleared = await invalidateApproval(quotationId, 'Design reference added')

  await logActivity({
    entity: 'quotation',
    id: quotationId,
    action: 'attachment',
    summary: approvalCleared
      ? `added the image ${attachment.fileName}; the customer approval was cleared`
      : `added the image ${attachment.fileName}`,
    actor,
  })

  return {
    ok: true,
    message: 'Image added',
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    comment: attachment.comment,
    approvalCleared,
  }
}
