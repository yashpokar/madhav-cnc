import type { z } from 'zod'
import type { ApiErrorCode } from '@/lib/api/errors'

/**
 * A small route registry. It feeds the OpenAPI generator (document.ts).
 * @asteasolutions/zod-to-openapi is not used: zod 4 converts its own schemas to
 * JSON Schema (z.toJSONSchema), which is all that is needed, and it avoids a
 * new dependency.
 */
export type RouteSpec = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /** Path under the server URL, e.g. "/me". */
  path: string
  summary: string
  tag: string
  auth: 'none' | 'user' | 'company'
  capability?: string
  idempotent?: boolean
  body?: z.ZodType
  /** The body is multipart/form-data (a file upload) instead of JSON. */
  multipart?: boolean
  query?: z.ZodType
  /** The shape inside `data`. Omit with `rawResponse` for non-enveloped bodies. */
  response?: z.ZodType
  status?: number
  /** The success body is not wrapped in { data }. */
  rawResponse?: { description: string }
  errors?: ApiErrorCode[]
}

const routes: RouteSpec[] = []

export function registerRoute(spec: RouteSpec) {
  const existing = routes.findIndex((r) => r.method === spec.method && r.path === spec.path)

  if (existing >= 0) routes.splice(existing, 1)

  routes.push(spec)
}

export function registeredRoutes(): readonly RouteSpec[] {
  return routes
}
