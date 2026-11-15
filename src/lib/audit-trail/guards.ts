import { getActiveCompanyId } from '@/lib/active-company'
import { currentActorRole, currentReason } from '@/lib/audit-trail/context'
import { requestContext } from '@/lib/api/request-context'
import { prisma } from '@/lib/prisma'

/**
 * Two rules every money-affecting service applies (docs/AUDIT.md):
 *
 *  1. A destructive action needs a reason (3+ characters), kept in the audit
 *     event next to the full snapshot of what was removed.
 *  2. The books can be locked: nothing dated on or before the company's lock
 *     date can be created, changed or deleted, except by a company
 *     administrator who gives a reason (which the audit trail keeps).
 *
 * The reason comes from the request: the web action or API route wraps the
 * service in withAuditNote({ reason }) (API: the X-Audit-Reason header or a
 * `reason` field). Services stay free of request plumbing.
 */

export const MIN_REASON = 3

/** True while handling a mobile API request (source api or mobile). */
export const isApiRequest = () => Boolean(requestContext.getStore()?.audit)

export type Guard = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

type DateLike = Date | string | null | undefined

const dayOf = (value: DateLike): number | null => {
  if (!value) return null

  const date = typeof value === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value) : value
  const time = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

  return Number.isNaN(time) ? null : time
}

const when = (day: number) =>
  new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Pure rule behind the lock (unit-tested). */
export function lockVerdict(input: {
  lockDate: DateLike
  dates: readonly DateLike[]
  role: string | null
  reason: string | null
}): Guard & { overridden?: boolean } {
  const lock = dayOf(input.lockDate)

  if (lock === null) return { ok: true }

  const touched = input.dates.map(dayOf).filter((d): d is number => d !== null && d <= lock)

  if (touched.length === 0) return { ok: true }

  const isAdmin = input.role === 'ADMIN'
  const hasReason = (input.reason?.trim().length ?? 0) >= MIN_REASON

  if (isAdmin && hasReason) return { ok: true, overridden: true }

  return {
    ok: false,
    error: isAdmin
      ? `The books are closed up to ${when(lock)}. Give a reason to change a record dated on or before that day.`
      : `The books are closed up to ${when(lock)}. Only a company administrator can change a record dated on or before that day.`,
  }
}

/**
 * Whether a delete without a reason is refused. The web always requires one. API
 * requests (including the mobile app) do not by default, so app builds already
 * installed keep working; set AUDIT_REASON_REQUIRED=true to require one there too.
 * The full copy of the record is kept either way.
 */
export function reasonRequired(fromApi: boolean, env = process.env.AUDIT_REASON_REQUIRED): boolean {
  return fromApi ? env === 'true' : true
}

export function reasonVerdict(reason: string | null, what: string, fromApi = isApiRequest()): Guard {
  if (!reasonRequired(fromApi)) return { ok: true }

  return (reason?.trim().length ?? 0) >= MIN_REASON
    ? { ok: true }
    : {
        ok: false,
        error: `Say why you are deleting this ${what} (a few words are enough). It is kept in the audit trail.`,
        fieldErrors: { reason: 'Required: say why' },
      }
}

/** The active company's lock date, or null. */
export async function getLockDate(): Promise<Date | null> {
  const id = await getActiveCompanyId()

  if (!id) return null

  const company = await prisma.companySetting.findUnique({ where: { id }, select: { lockDate: true } })

  return company?.lockDate ?? null
}

/**
 * `dates`: every date the change touches (the record's current date AND the
 * new one on an edit). `destructive` also demands a reason.
 */
export async function guardMoneyChange(
  dates: readonly DateLike[],
  options: { destructive?: boolean; what?: string } = {},
): Promise<Guard> {
  const reason = currentReason()

  if (options.destructive) {
    const verdict = reasonVerdict(reason, options.what ?? 'record')

    if (!verdict.ok) return verdict
  }

  const lockDate = await getLockDate()

  if (!lockDate) return { ok: true }

  return lockVerdict({ lockDate, dates, role: await currentActorRole(), reason })
}
