'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const commentSchema = z
  .string()
  .trim()
  .max(1000, 'Comment is too long')
  .transform((value) => (value ? value : null))

async function assertEditable(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { status: true },
  })

  if (!quotation) {
    return 'Quotation not found'
  }

  if (quotation.status === 'CONVERTED') {
    return 'This quotation is confirmed as an order and cannot be changed'
  }

  return null
}

export async function setAttachmentComment(
  attachmentId: string,
  comment: string,
): Promise<SimpleResult> {
  await requireCapability('quotation:update')

  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true },
  })

  if (!attachment) {
    return { ok: false, error: 'Image not found' }
  }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) {
    return { ok: false, error: locked }
  }

  const parsed = commentSchema.safeParse(comment)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  await prisma.quotationAttachment.update({
    where: { id: attachmentId },
    data: { comment: parsed.data },
  })

  revalidatePath(`/quotations/${attachment.quotationId}`)

  return { ok: true, message: 'Comment saved' }
}

export async function removeAttachment(
  attachmentId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')

  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true, removedAt: true, fileName: true },
  })

  if (!attachment) {
    return { ok: false, error: 'Image not found' }
  }

  if (attachment.removedAt) {
    return { ok: false, error: 'Already removed' }
  }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) {
    return { ok: false, error: locked }
  }

  await prisma.quotationAttachment.update({
    where: { id: attachmentId },
    data: { removedAt: new Date(), removedById: user.id },
  })

  revalidatePath(`/quotations/${attachment.quotationId}`)

  return { ok: true, message: `${attachment.fileName} removed from the current set` }
}

export async function restoreAttachment(
  attachmentId: string,
): Promise<SimpleResult> {
  await requireCapability('quotation:update')

  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, quotationId: true, removedAt: true },
  })

  if (!attachment) {
    return { ok: false, error: 'Image not found' }
  }

  if (!attachment.removedAt) {
    return { ok: false, error: 'This image is already in the current set' }
  }

  const locked = await assertEditable(attachment.quotationId)

  if (locked) {
    return { ok: false, error: locked }
  }

  await prisma.quotationAttachment.update({
    where: { id: attachmentId },
    data: { removedAt: null, removedById: null },
  })

  revalidatePath(`/quotations/${attachment.quotationId}`)

  return { ok: true, message: 'Image restored' }
}
