'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import * as invoices from '@/lib/services/invoices'

export type { SimpleResult }

/**
 * The customer link for an issued invoice, made on first use. Anyone who can
 * update invoices may create it; the link itself only shows that one invoice.
 */
export async function ensureInvoiceShareLink(
  invoiceId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')
  const result = await invoices.ensureInvoiceShareLink(
    { id: user.id, name: user.name },
    invoiceId,
  )

  if (!result.ok) return { ok: false, error: result.error }

  if (result.created) revalidatePath(`/invoices/${invoiceId}`)

  return { ok: true, message: result.message, id: result.token }
}

/** Replaces the link; the old one stops opening straight away. */
export async function regenerateInvoiceShareLink(
  invoiceId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')
  const result = await invoices.regenerateInvoiceShareLink(
    { id: user.id, name: user.name },
    invoiceId,
  )

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(`/invoices/${invoiceId}`)

  return { ok: true, message: result.message, id: result.token }
}
