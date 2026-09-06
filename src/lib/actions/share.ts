'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { findShareByToken, shareIsUsable } from '@/lib/queries/share'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

function newToken() {
  return randomBytes(24).toString('base64url')
}

export async function createShareLink(
  quotationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, validUntil: true },
  })

  if (!quotation) {
    return { ok: false, error: 'Quotation not found' }
  }

  const existing = await prisma.quotationShare.findFirst({
    where: { quotationId, isRevoked: false },
    select: { id: true, token: true },
  })

  if (existing) {
    return { ok: true, message: 'Link ready', id: existing.token }
  }

  const share = await prisma.quotationShare.create({
    data: {
      quotationId,
      token: newToken(),
      createdById: user.id,
    },
    select: { token: true },
  })

  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: 'Share link created', id: share.token }
}

export async function revokeShareLink(
  quotationId: string,
): Promise<SimpleResult> {
  await requireCapability('quotation:update')

  const result = await prisma.quotationShare.updateMany({
    where: { quotationId, isRevoked: false },
    data: { isRevoked: true },
  })

  if (result.count === 0) {
    return { ok: false, error: 'No active link to revoke' }
  }

  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: 'Link revoked. It will no longer open.' }
}

const responseSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  name: z.string().trim().min(1, 'Please enter your name').max(120),
  note: z.string().trim().max(1000).optional(),
})

export async function respondToShare(input: {
  token: string
  decision: 'ACCEPTED' | 'REJECTED'
  name: string
  note?: string
}): Promise<SimpleResult> {
  const share = await findShareByToken(input.token)

  if (!share || !shareIsUsable(share)) {
    return { ok: false, error: 'This link is no longer available' }
  }

  if (share.decision !== 'PENDING') {
    return { ok: false, error: 'A response has already been recorded' }
  }

  const parsed = responseSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (parsed.data.decision === 'REJECTED' && !parsed.data.note) {
    return { ok: false, error: 'Please tell us briefly why' }
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id: share.quotationId },
    select: { status: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.quotationShare.update({
      where: { id: share.id },
      data: {
        decision: parsed.data.decision,
        respondedAt: new Date(),
        respondedByName: parsed.data.name,
        responseNote: parsed.data.note ?? null,
      },
    })

    if (quotation && (quotation.status === 'SENT' || quotation.status === 'DRAFT')) {
      await tx.quotation.update({
        where: { id: share.quotationId },
        data: {
          status: parsed.data.decision === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
        },
      })
    }
  })

  revalidatePath(`/quotations/${share.quotationId}`)
  revalidatePath('/quotations')

  return {
    ok: true,
    message:
      parsed.data.decision === 'ACCEPTED'
        ? 'Thank you. Your approval has been recorded.'
        : 'Thank you. Your feedback has been recorded.',
  }
}

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first').max(1000),
  name: z.string().trim().min(1, 'Please enter your name').max(120),
})

export async function addCustomerComment(input: {
  token: string
  attachmentId?: string | null
  body: string
  name: string
}): Promise<SimpleResult> {
  const share = await findShareByToken(input.token)

  if (!share || !shareIsUsable(share)) {
    return { ok: false, error: 'This link is no longer available' }
  }

  const parsed = commentSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (input.attachmentId) {
    const owned = await prisma.quotationAttachment.findFirst({
      where: { id: input.attachmentId, quotationId: share.quotationId },
      select: { id: true },
    })

    if (!owned) {
      return { ok: false, error: 'That image is not part of this quotation' }
    }
  }

  await prisma.quotationComment.create({
    data: {
      quotationId: share.quotationId,
      attachmentId: input.attachmentId ?? null,
      body: parsed.data.body,
      authorType: 'CUSTOMER',
      authorName: parsed.data.name,
    },
  })

  revalidatePath(`/quotations/${share.quotationId}`)

  return { ok: true, message: 'Comment added' }
}

export async function addStaffComment(
  quotationId: string,
  body: string,
  attachmentId?: string | null,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')

  const parsed = z.string().trim().min(1, 'Write a comment first').max(1000).safeParse(body)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  await prisma.quotationComment.create({
    data: {
      quotationId,
      attachmentId: attachmentId ?? null,
      body: parsed.data,
      authorType: 'STAFF',
      authorUserId: user.id,
    },
  })

  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: 'Comment added' }
}
