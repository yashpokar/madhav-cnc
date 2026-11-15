'use server'

import { getPublicBaseUrl } from '@/lib/public-url'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import { findShareByToken, shareIsUsable } from '@/lib/queries/share'
import type { SimpleResult } from '@/lib/actions/quotations'
import * as quotations from '@/lib/services/quotations'

export type { SimpleResult }

export async function createShareLink(
  quotationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')
  const result = await quotations.createShareLink(
    { userId: user.id, name: user.name },
    quotationId,
    (await getPublicBaseUrl()) || null,
  )

  if (!result.ok) return result

  if (result.created) {
    revalidatePath(`/quotations/${quotationId}`)
  }

  return { ok: true, message: result.message, id: result.token }
}

export async function revokeShareLink(
  quotationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')
  const result = await quotations.revokeShareLink({ userId: user.id, name: user.name }, quotationId)

  if (!result.ok) return result

  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: result.message }
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

  const note = parsed.data.note
    ? `: “${parsed.data.note.length > 120 ? `${parsed.data.note.slice(0, 117)}…` : parsed.data.note}”`
    : ''

  await logActivity({
    entity: 'quotation',
    id: share.quotationId,
    action: 'customer-response',
    summary:
      parsed.data.decision === 'ACCEPTED'
        ? `approved the quotation on the customer link (signed as ${parsed.data.name})${note}`
        : `asked for changes on the customer link (${parsed.data.name})${note}`,
    actor: null,
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

  await logActivity({
    entity: 'quotation',
    id: share.quotationId,
    action: 'comment',
    summary: `commented on the customer link (${parsed.data.name})`,
    actor: null,
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
  const result = await quotations.addStaffComment(
    { userId: user.id, name: user.name },
    quotationId,
    body,
    attachmentId,
  )

  if (!result.ok) return result

  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: result.message }
}
