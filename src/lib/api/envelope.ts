import type { ApiError } from '@/lib/api/errors'

export const REQUEST_ID_HEADER = 'X-Request-Id'

export type SuccessBody<T = unknown> = { data: T; meta?: Record<string, unknown> }

export type ErrorBody = {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
    requestId: string
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/

/** Uses the caller's X-Request-Id when it is sane (so logs line up), else makes one. */
export function requestIdFrom(headers: Headers): string {
  const given = headers.get(REQUEST_ID_HEADER)

  return given && SAFE_ID.test(given) ? given : crypto.randomUUID()
}

export function successBody<T>(data: T, meta?: Record<string, unknown>): SuccessBody<T> {
  return meta && Object.keys(meta).length > 0 ? { data, meta } : { data }
}

export function errorBody(error: ApiError, requestId: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
      requestId,
    },
  }
}

/** Adds the headers every API response carries. */
export function withCommonHeaders(response: Response, requestId: string): Response {
  response.headers.set(REQUEST_ID_HEADER, requestId)

  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store')

  return response
}

export function errorResponse(error: ApiError, requestId: string): Response {
  const response = Response.json(errorBody(error, requestId), { status: error.status })

  if (error.retryAfter !== undefined) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfter))))
  }

  return withCommonHeaders(response, requestId)
}
