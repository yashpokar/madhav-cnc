import type { z } from 'zod'
import { assertAppVersion } from '@/lib/api/app-version'
import {
  requireApiCapability,
  requireApiCompany,
  requireApiUser,
  type ApiUser,
} from '@/lib/api/auth'
import { errorResponse, requestIdFrom, successBody, withCommonHeaders } from '@/lib/api/envelope'
import { ApiError, toApiError } from '@/lib/api/errors'
import { etagOf, matchesIfNoneMatch } from '@/lib/api/etag'
import {
  IDEMPOTENCY_HEADER,
  hashRequest,
  parseIdempotencyKey,
  runIdempotent,
  type StoredResponse,
} from '@/lib/api/idempotency'
import { prismaIdempotencyStore } from '@/lib/api/idempotency-store'
import { clientAddress, enforceRateLimit, rateClassFor } from '@/lib/api/rate-limit'
import { runInRequestContext } from '@/lib/api/request-context'
import type { Action, Resource } from '@/lib/permissions'

export { assertIfMatch, etagOf } from '@/lib/api/etag'

export type AuthMode =
  /** Public. */
  | 'none'
  /** Signed in; no company needed (profile, onboarding). */
  | 'user'
  /** Signed in AND working in a company named by X-Company-Id. */
  | 'company'

export type RouteOptions<B extends z.ZodType | undefined, Q extends z.ZodType | undefined> = {
  auth: AuthMode
  /** Needs `auth: 'company'`: the role in that company must grant this. */
  capability?: `${Resource}:${Action}`
  body?: B
  query?: Q
  /** Honour an Idempotency-Key header: a retry replays the first response. */
  idempotent?: boolean
  /** Counts against the (stricter) upload rate limit. */
  upload?: boolean
  /** Set false for the endpoint an outdated app uses to learn it must update. */
  versionGate?: boolean
}

export type HandlerContext<A extends AuthMode, B, Q> = {
  request: Request
  requestId: string
  user: A extends 'none' ? null : ApiUser
  companyId: A extends 'company' ? string : null
  body: B extends z.ZodType ? z.output<B> : undefined
  query: Q extends z.ZodType ? z.output<Q> : Record<string, string>
  params: Record<string, string>
}

type ReplyInit = {
  status?: number
  meta?: Record<string, unknown>
  headers?: Record<string, string>
  /** Send `data` as the whole body instead of inside the { data } envelope. */
  raw?: boolean
}

/** What a handler returns when it needs more than a plain 200 { data }. */
export class ApiReply {
  constructor(
    readonly data: unknown,
    readonly init: ReplyInit = {},
  ) {}
}

export const reply = (data: unknown, init: ReplyInit = {}) => new ApiReply(data, init)

/**
 * A reply carrying an ETag, or a bodiless 304 when the caller's If-None-Match
 * already matches (save a phone from re-downloading an unchanged record).
 */
export function replyWithEtag(request: Request, data: unknown, init: ReplyInit = {}): ApiReply {
  const etag = etagOf(data)

  if (matchesIfNoneMatch(request, etag)) {
    return new ApiReply(null, { ...init, status: 304, headers: { ...init.headers, ETag: etag } })
  }

  return new ApiReply(data, { ...init, headers: { ...init.headers, ETag: etag } })
}

function fieldsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}

  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_'

    fields[path] ??= issue.message
  }

  return fields
}

function parseWith<T extends z.ZodType>(schema: T, value: unknown, what: string): z.output<T> {
  const parsed = schema.safeParse(value)

  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', `The ${what} is not valid.`, { fields: fieldsOf(parsed.error) })
  }

  return parsed.data
}

function toStored(result: unknown): StoredResponse & { reply: ApiReply } {
  const r = result instanceof ApiReply ? result : new ApiReply(result)

  return {
    status: r.init.status ?? 200,
    body: r.init.raw ? r.data : successBody(r.data, r.init.meta),
    reply: r,
  }
}

function toResponse(stored: StoredResponse, extra: Record<string, string> = {}): Response {
  const response =
    stored.status === 304 || stored.status === 204
      ? new Response(null, { status: stored.status })
      : Response.json(stored.body, { status: stored.status })

  for (const [name, value] of Object.entries(extra)) response.headers.set(name, value)

  return response
}

export type RouteContext = { params: Promise<Record<string, string>> }

/** For calling a handler directly (tests). */
export const NO_PARAMS: RouteContext = { params: Promise.resolve({}) }

/**
 * The one way to write a mobile API route handler. In order it: assigns a
 * request id, checks the app version, rate-limits, authenticates, resolves and
 * verifies the company, checks the capability, validates the body and query,
 * then runs `fn` inside the request's tenant context (so every database query
 * is limited to that company), with optional idempotent replay. Anything thrown
 * becomes the error envelope; nothing internal reaches the client.
 */
export function apiRoute<
  A extends AuthMode,
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
>(
  options: RouteOptions<B, Q> & { auth: A },
  fn: (context: HandlerContext<A, B, Q>) => Promise<unknown>,
) {
  return async function handler(request: Request, routeContext: RouteContext): Promise<Response> {
    const requestId = requestIdFrom(request.headers)

    try {
      if (options.versionGate !== false) assertAppVersion(request.headers)

      const rateClass = rateClassFor(request.method, options.upload)

      if (options.auth === 'none') {
        await enforceRateLimit(`ip:${clientAddress(request.headers)}`, 'anonymous')
      }

      let user: ApiUser | null = null
      let companyId: string | null = null

      if (options.auth !== 'none') {
        user = await requireApiUser(request)
        await enforceRateLimit(`user:${user.id}`, rateClass)
      }

      if (options.auth === 'company' && user) {
        const company = await requireApiCompany(user, request)

        user = company.user
        companyId = company.companyId

        if (options.capability) requireApiCapability(user, options.capability)
      }

      const url = new URL(request.url)
      const params = (await routeContext?.params) ?? {}
      const rawBody = options.body || options.idempotent ? await request.text() : ''

      let body: unknown

      if (options.body) {
        let json: unknown

        try {
          json = rawBody.trim() ? JSON.parse(rawBody) : undefined
        } catch {
          throw new ApiError('VALIDATION_FAILED', 'The request body is not valid JSON.', {
            fields: { _: 'Not valid JSON' },
          })
        }

        body = parseWith(options.body, json, 'request body')
      }

      const query = options.query
        ? parseWith(options.query, Object.fromEntries(url.searchParams), 'query')
        : Object.fromEntries(url.searchParams)

      const context = { request, requestId, user, companyId, body, query, params } as HandlerContext<A, B, Q>

      const execute = () =>
        runInRequestContext({ companyId: companyId ?? undefined }, async () => toStored(await fn(context)))

      const key = options.idempotent && user ? parseIdempotencyKey(request.headers.get(IDEMPOTENCY_HEADER)) : null

      if (key && user) {
        const outcome = await runInRequestContext({ companyId: companyId ?? undefined }, () =>
          runIdempotent(
            prismaIdempotencyStore,
            { userId: user.id, companyId: companyId ?? '', key },
            {
              method: request.method,
              path: url.pathname,
              requestHash: hashRequest(request.method, url.pathname, rawBody),
            },
            async () => {
              const result = await toStored(await fn(context))

              return { status: result.status, body: result.body }
            },
          ),
        )

        return withCommonHeaders(
          toResponse(outcome, outcome.replayed ? { 'Idempotent-Replayed': 'true' } : {}),
          requestId,
        )
      }

      const result = await execute()
      const headers = result.reply.init.headers ?? {}

      return withCommonHeaders(toResponse(result, headers), requestId)
    } catch (error) {
      const apiError = toApiError(error)

      if (apiError.code === 'INTERNAL') {
        console.error(`[api ${requestId}] ${request.method} ${new URL(request.url).pathname}`, error)
      }

      return errorResponse(apiError, requestId)
    }
  }
}
