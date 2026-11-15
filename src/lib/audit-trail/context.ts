import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { requestContext } from '@/lib/api/request-context'

/**
 * Who is changing data, and how: handed to the database with every write so
 * the audit trigger can attribute it (see docs/AUDIT.md). Nothing here decides
 * WHETHER a change is recorded (the database always records it); it only says
 * who did it. A write with no context at all is recorded as the System.
 */
export type AuditSource = 'web' | 'api' | 'mobile' | 'system' | 'webhook' | 'seed' | 'public'

export const AUDIT_SOURCES: readonly AuditSource[] = [
  'web',
  'api',
  'mobile',
  'system',
  'webhook',
  'seed',
  'public',
]

export type AuditContext = {
  actorUserId?: string | null
  actorName?: string | null
  actorRole?: string | null
  source?: AuditSource
  requestId?: string | null
  ip?: string | null
  userAgent?: string | null
  /** Only a fallback for rows whose company can not be read off the row itself. */
  companyId?: string | null
}

/** Per-operation extras layered over the request's context (withAuditNote). */
export type AuditNote = {
  /** Why: required for deleting money records, optional on edits. */
  reason?: string | null
  /** Replaces the automatic one-line summary of every event in the operation. */
  summary?: string | null
  /** Ties the events of one logical operation together (defaults to the database transaction). */
  correlationId?: string | null
  /** Lets an operation mark its events as a 'restore'. */
  action?: 'restore'
  /** Overrides who/where for handlers with no signed-in person (a payment provider's webhook). */
  source?: AuditSource
  actorName?: string
}

// Shared on globalThis for the same reason as the request context: the bundler
// may load this module twice.
const shared = globalThis as { __prodlysAuditNote?: AsyncLocalStorage<AuditNote> }

const noteStore = (shared.__prodlysAuditNote ??= new AsyncLocalStorage<AuditNote>())

/**
 * Runs `fn` so every change it makes carries this reason / summary / correlation.
 * `fn` is awaited INSIDE the scope: a Prisma call is lazy (it runs when awaited),
 * so returning one unawaited would run it outside the scope and lose the note.
 */
export function withAuditNote<T>(note: AuditNote, fn: () => PromiseLike<T>): Promise<T> {
  return noteStore.run({ ...noteStore.getStore(), ...note }, async () => await fn())
}

/** The actor behind a web request. */
type WebActor = { id: string; name: string; role: string | null }

// Remembered by the session cookie (hashed), for a few minutes. React's cache()
// can not carry this: it only works while rendering, and the database layer runs
// in other async contexts (server actions, the driver adapter). A session cookie
// always belongs to one person, and the company cookie is part of the same
// header, so the role in the active company is stable for the key.
const WEB_ACTORS = new Map<string, { actor: WebActor; until: number }>()
const WEB_ACTOR_TTL_MS = 5 * 60_000
const WEB_ACTOR_MAX = 2000

const cookieKey = (headers: Headers) => {
  const cookie = headers.get('cookie')

  return cookie ? createHash('sha256').update(cookie).digest('hex') : null
}

/**
 * Called by the session helpers when they have identified the person: from then
 * on the database layer knows who made this request's writes. A no-op outside
 * a web request.
 */
export async function rememberWebActor(actor: WebActor) {
  try {
    const { headers } = await import('next/headers')
    const key = cookieKey(await headers())

    if (!key) return

    if (WEB_ACTORS.size >= WEB_ACTOR_MAX) WEB_ACTORS.delete(WEB_ACTORS.keys().next().value as string)

    WEB_ACTORS.set(key, { actor, until: Date.now() + WEB_ACTOR_TTL_MS })
  } catch {
    // Not in a web request.
  }
}

function recalledWebActor(headers: Headers): WebActor | null {
  const key = cookieKey(headers)
  const found = key ? WEB_ACTORS.get(key) : undefined

  return found && found.until > Date.now() ? found.actor : null
}

export const MOBILE_CLIENT_HEADER = 'x-client'
export const MOBILE_CLIENT_VALUE = 'prodlys-mobile'

/** `mobile` when the app says so (X-Client or an Expo user agent), otherwise plain `api`. */
export function sourceOfApiRequest(headers: Headers): AuditSource {
  const client = headers.get(MOBILE_CLIENT_HEADER)?.trim().toLowerCase()
  const agent = headers.get('user-agent') ?? ''

  return client === MOBILE_CLIENT_VALUE || /\bexpo\b/i.test(agent) ? 'mobile' : 'api'
}

/** Builds the context the API handler runs a request in. */
export function apiAuditContext(input: {
  request: Request
  requestId: string
  user: { id: string; name: string; role: string } | null
  companyId: string | null
  clientAddress: string
}): AuditContext {
  return {
    actorUserId: input.user?.id ?? null,
    actorName: input.user?.name ?? 'Anonymous API client',
    actorRole: input.user?.role ?? null,
    source: sourceOfApiRequest(input.request.headers),
    requestId: input.requestId,
    ip: input.clientAddress,
    userAgent: input.request.headers.get('user-agent'),
    companyId: input.companyId,
  }
}

async function webContext(): Promise<AuditContext> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()

    const actor = recalledWebActor(h)

    return {
      actorUserId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorRole: actor?.role ?? null,
      // A request with nobody signed in is a public link (or a sign-in flow).
      source: actor ? 'web' : 'public',
      requestId: h.get('x-request-id') ?? h.get('x-railway-request-id') ?? h.get('x-vercel-id'),
      ip: forwarded || h.get('x-real-ip'),
      userAgent: h.get('user-agent'),
    }
  } catch {
    // No request: a script or a background job.
    const source = process.env.AUDIT_SOURCE as AuditSource | undefined

    return { source: source && AUDIT_SOURCES.includes(source) ? source : process.env.SEED_COMPANY_ID ? 'seed' : 'system' }
  }
}

/**
 * The context for the statement about to run: the API request's, else the web
 * request's, else "system", with any operation note on top. Never throws: a
 * change must not fail because attribution could not be resolved (the database
 * then records it as the System).
 */
export async function currentAuditPayload(): Promise<Record<string, string | null> | null> {
  try {
    const api = requestContext.getStore()?.audit
    const base = api ?? (await webContext())
    const note = noteStore.getStore()

    const payload: Record<string, string | null | undefined> = {
      actor_user_id: note?.source ? null : base.actorUserId,
      actor_name: note?.actorName ?? base.actorName,
      actor_role: note?.source ? null : base.actorRole,
      source: note?.source ?? base.source,
      request_id: base.requestId,
      ip: base.ip,
      user_agent: base.userAgent?.slice(0, 300),
      company_id: base.companyId,
      reason: note?.reason?.trim().slice(0, 1000),
      summary: note?.summary,
      correlation_id: note?.correlationId,
      action: note?.action,
    }

    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null && v !== ''))

    return Object.keys(clean).length > 0 ? (clean as Record<string, string>) : null
  } catch {
    return null
  }
}

/** The role the current actor has in the active company (null when unknown). */
export async function currentActorRole(): Promise<string | null> {
  const api = requestContext.getStore()?.audit

  if (api) return api.actorRole ?? null

  try {
    const { headers } = await import('next/headers')

    return recalledWebActor(await headers())?.role ?? null
  } catch {
    return null
  }
}

/** The reason the caller gave for this operation (withAuditNote), if any. */
export function currentReason(): string | null {
  return noteStore.getStore()?.reason?.trim() || null
}
