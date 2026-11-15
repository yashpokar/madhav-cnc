'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

function newToken() {
  return randomBytes(24).toString('base64url')
}

/**
 * The customer link for an issued invoice, made on first use. Anyone who can
 * update invoices may create it; the link itself only shows that one invoice.
 */
export async function ensureInvoiceShareLink(
  invoiceId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, shareToken: true },
  })

  if (!invoice) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (invoice.status !== 'ISSUED') {
    return { ok: false, error: 'Only an issued invoice can be shared' }
  }

  if (invoice.shareToken) {
    return { ok: true, message: 'Link ready', id: invoice.shareToken }
  }

  const token = newToken()

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
      ? { ok: true, message: 'Link ready', id: current.shareToken }
      : { ok: false, error: 'Could not create the link' }
  }

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'shared',
    summary: 'created the customer link',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath(`/invoices/${invoiceId}`)

  return { ok: true, message: 'Share link created', id: token }
}

/** Replaces the link; the old one stops opening straight away. */
export async function regenerateInvoiceShareLink(
  invoiceId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!invoice) {
    return { ok: false, error: 'Invoice not found' }
  }

  if (invoice.status !== 'ISSUED') {
    return { ok: false, error: 'Only an issued invoice can be shared' }
  }

  const token = newToken()

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { shareToken: token },
  })

  await logActivity({
    entity: 'invoice',
    id: invoiceId,
    action: 'shared',
    summary: 'regenerated the customer link (the old link no longer opens)',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath(`/invoices/${invoiceId}`)

  return {
    ok: true,
    message: 'New link created. The old one no longer opens.',
    id: token,
  }
}
