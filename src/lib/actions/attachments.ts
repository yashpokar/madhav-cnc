'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import * as attachments from '@/lib/services/quotation-attachments'

export type { SimpleResult }

// Thin adapters over src/lib/services/quotation-attachments.ts.

export async function setAttachmentComment(
  attachmentId: string,
  comment: string,
): Promise<SimpleResult> {
  await requireCapability('quotation:update')

  const result = await attachments.setAttachmentComment(attachmentId, comment)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(`/quotations/${result.quotationId}`)

  return { ok: true, message: result.message }
}

export async function removeAttachment(
  attachmentId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')
  const result = await attachments.removeAttachment({ id: user.id, name: user.name }, attachmentId)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(`/quotations/${result.quotationId}`)

  return { ok: true, message: result.message }
}

export async function restoreAttachment(
  attachmentId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')
  const result = await attachments.restoreAttachment({ id: user.id, name: user.name }, attachmentId)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(`/quotations/${result.quotationId}`)

  return { ok: true, message: result.message }
}
