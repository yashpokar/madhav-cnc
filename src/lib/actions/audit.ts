'use server'

import { revalidatePath } from 'next/cache'
import { requireCompanyId } from '@/lib/active-company'
import { withAuditNote } from '@/lib/audit-trail/context'
import { AUDIT_MODELS } from '@/lib/audit-trail/model-map'
import { presentEvent, type HistoryEntry } from '@/lib/audit-trail/present'
import { entityHistory, verifyChain, type ChainReport } from '@/lib/audit-trail/queries'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'
import { requireCapability, requireUser } from '@/lib/session'

export type HistoryResult = { ok: true; entries: HistoryEntry[] } | { ok: false; error: string }

/**
 * The history of one record for the History drawer. Needs the right to READ
 * that kind of record (someone who can not see invoices can not see their
 * history either), and only ever reads the active company's events.
 */
export async function loadHistory(model: string, id: string): Promise<HistoryResult> {
  const info = AUDIT_MODELS[model]
  const user = await requireUser()

  if (!info || !can(user.role, info.read)) return { ok: false, error: 'You can not see the history of this record.' }

  const companyId = await requireCompanyId()
  const events = await entityHistory(companyId, model, id)

  return { ok: true, entries: events.map((event) => presentEvent(event, { type: model, id })) }
}

export type VerifyResult = { ok: true; report: Pick<ChainReport, 'ok' | 'checked' | 'head' | 'breaks'> } | { ok: false; error: string }

/** Recomputes the whole hash chain of the active company (administrators). */
export async function verifyIntegrity(): Promise<VerifyResult> {
  await requireCapability('settings:update')

  const companyId = await requireCompanyId()
  const report = await verifyChain(companyId)

  return { ok: true, report: { ok: report.ok, checked: report.checked, head: report.head, breaks: report.breaks.slice(0, 20) } }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Closes the books up to and including `date` (null reopens them). The change
 * itself is an audited change of the company settings, with the reason.
 */
export async function setLockDate(date: string | null, reason?: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireCapability('settings:update')

  if (date !== null && !DAY.test(date)) return { ok: false, error: 'Choose a valid date' }

  if ((reason?.trim().length ?? 0) < 3) return { ok: false, error: 'Say why you are changing the lock date. It is kept in the audit trail.' }

  const companyId = await requireCompanyId()

  await withAuditNote({ reason, summary: date ? `Closed the books up to ${date}` : 'Reopened the books (lock date removed)' }, () =>
    prisma.companySetting.update({
      where: { id: companyId },
      data: { lockDate: date ? new Date(`${date}T00:00:00Z`) : null },
    }),
  )

  revalidatePath('/settings/audit')

  return { ok: true, message: date ? `Books are closed up to ${date}` : 'Books reopened' }
}
