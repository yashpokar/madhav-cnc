/** Last few records a person opened, kept per user in the browser. */

export type Recent = { href: string; title: string; kind: string }

export const MAX_RECENTS = 5

export const recentsKey = (userId: string) => `prodlys:recents:${userId}`

const DETAIL = /^\/(customers|quotations|orders|invoices|payments|expenses|items|vendors|partners)\/([^/]+)$/

const KINDS: Record<string, string> = {
  customers: 'Customer',
  quotations: 'Quotation',
  orders: 'Order',
  invoices: 'Invoice',
  payments: 'Receipt',
  expenses: 'Expense',
  items: 'Item',
  vendors: 'Vendor',
  partners: 'Partner',
}

/** Kind label when the path is a record page, else null (lists and /new are not records). */
export function recordKind(pathname: string): string | null {
  const match = DETAIL.exec(pathname)

  if (!match || match[2] === 'new') return null

  return KINDS[match[1]] ?? null
}

/** Adds an entry to the front, drops duplicates by href and keeps the newest few. */
export function addRecent(list: readonly Recent[], entry: Recent, max = MAX_RECENTS): Recent[] {
  return [entry, ...list.filter((row) => row.href !== entry.href)].slice(0, max)
}

export function parseRecents(raw: string | null | undefined): Recent[] {
  if (!raw) return []

  try {
    const data: unknown = JSON.parse(raw)

    if (!Array.isArray(data)) return []

    return data
      .filter(
        (row): row is Recent =>
          Boolean(row) &&
          typeof row.href === 'string' &&
          row.href.startsWith('/') &&
          typeof row.title === 'string' &&
          typeof row.kind === 'string',
      )
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function loadRecents(userId: string): Recent[] {
  try {
    return parseRecents(window.localStorage.getItem(recentsKey(userId)))
  } catch {
    return []
  }
}

export function saveRecent(userId: string, entry: Recent): void {
  try {
    const next = addRecent(loadRecents(userId), entry)

    window.localStorage.setItem(recentsKey(userId), JSON.stringify(next))
  } catch {
    // Storage blocked or full: recents are a convenience only.
  }
}
