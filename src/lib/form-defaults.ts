/** Remembered form choices (per user and company) and date defaults. Browser-only storage, always optional. */

export type RememberedDefaults = {
  paymentMode?: string
  gstRate?: number
}

export const defaultsKey = (userId: string, companyId: string | null) =>
  `prodlys:form-defaults:${userId}:${companyId ?? 'none'}`

export function parseDefaults(raw: string | null | undefined): RememberedDefaults {
  if (!raw) return {}

  try {
    const data: unknown = JSON.parse(raw)

    if (!data || typeof data !== 'object') return {}

    const { paymentMode, gstRate } = data as Record<string, unknown>
    const out: RememberedDefaults = {}

    if (typeof paymentMode === 'string' && paymentMode) out.paymentMode = paymentMode
    if (typeof gstRate === 'number' && Number.isFinite(gstRate) && gstRate >= 0 && gstRate <= 100) {
      out.gstRate = gstRate
    }

    return out
  } catch {
    return {}
  }
}

export function loadDefaults(userId: string, companyId: string | null): RememberedDefaults {
  try {
    return parseDefaults(window.localStorage.getItem(defaultsKey(userId, companyId)))
  } catch {
    return {}
  }
}

export function rememberDefaults(
  userId: string,
  companyId: string | null,
  patch: RememberedDefaults,
): void {
  try {
    const merged = { ...loadDefaults(userId, companyId), ...patch }

    window.localStorage.setItem(defaultsKey(userId, companyId), JSON.stringify(merged))
  } catch {
    // Storage blocked: nothing to remember, nothing breaks.
  }
}

/** Use the remembered value only if it is still on offer; otherwise the fallback. */
export function pickRemembered<T extends string | number>(
  remembered: T | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return remembered !== undefined && allowed.includes(remembered) ? remembered : fallback
}

/** Today as YYYY-MM-DD in India time, the app's business timezone. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}

/** Base date plus the customer's payment terms in days; null when there are no terms. */
export function dueDateFromTerms(baseIso: string, termsDays: number | null | undefined): string | null {
  if (!termsDays || termsDays <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(baseIso)) return null

  const date = new Date(`${baseIso}T00:00:00Z`)

  date.setUTCDate(date.getUTCDate() + Math.floor(termsDays))

  return date.toISOString().slice(0, 10)
}
