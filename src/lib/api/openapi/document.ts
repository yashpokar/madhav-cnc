import { z } from 'zod'
import { ERROR_STATUS, type ApiErrorCode } from '@/lib/api/errors'
import { registeredRoutes, type RouteSpec } from '@/lib/api/openapi/registry'
import '@/lib/api/openapi/routes'

type Json = Record<string, unknown>

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  const out = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Json

  delete out.$schema

  return out
}

const errorSchema: Json = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', enum: Object.keys(ERROR_STATUS) },
        message: { type: 'string' },
        fields: { type: 'object', additionalProperties: { type: 'string' } },
        requestId: { type: 'string' },
      },
    },
  },
}

const ERROR_DESCRIPTIONS: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Missing, invalid or expired bearer token',
  ACCOUNT_DEACTIVATED: 'The account has been deactivated',
  FORBIDDEN: 'The role in this company does not allow it',
  COMPANY_REQUIRED: 'X-Company-Id header is missing',
  COMPANY_NOT_ACCESSIBLE: 'The company does not exist or the person may not open it',
  NOT_FOUND: 'No such record in this company',
  VALIDATION_FAILED: 'The request is invalid; see error.fields',
  CONFLICT: 'The request conflicts with the current state',
  PRECONDITION_FAILED: 'If-Match did not match the current version',
  IDEMPOTENCY_KEY_REUSED: 'The Idempotency-Key was used for a different request',
  RATE_LIMITED: 'Too many requests; see Retry-After',
  UPGRADE_REQUIRED: 'The app version is no longer supported',
  PLAN_LIMIT_REACHED: 'The company has used its free invoices; a paid plan is needed to issue more',
  INTERNAL: 'Unexpected error',
}

function operation(route: RouteSpec): Json {
  const errors = new Set<ApiErrorCode>(['RATE_LIMITED', 'UPGRADE_REQUIRED', 'INTERNAL', ...(route.errors ?? [])])

  if (route.auth !== 'none') errors.add('UNAUTHENTICATED')
  if (route.auth === 'company') {
    errors.add('COMPANY_REQUIRED')
    errors.add('COMPANY_NOT_ACCESSIBLE')
  }
  if (route.capability) errors.add('FORBIDDEN')
  if (route.body || route.query) errors.add('VALIDATION_FAILED')

  const byStatus = new Map<number, ApiErrorCode[]>()

  for (const code of [...errors].sort()) {
    const status = ERROR_STATUS[code]

    byStatus.set(status, [...(byStatus.get(status) ?? []), code])
  }

  const responses: Record<string, Json> = {
    [String(route.status ?? 200)]: route.rawResponse
      ? { description: route.rawResponse.description, content: { 'application/json': { schema: { type: 'object' } } } }
      : {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: route.response ? jsonSchema(route.response, 'output') : {},
                  meta: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
  }

  for (const [status, codes] of [...byStatus].sort(([a], [b]) => a - b)) {
    responses[String(status)] = {
      description: codes.map((c) => `${c}: ${ERROR_DESCRIPTIONS[c]}`).join('; '),
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    }
  }

  const parameters: Json[] = []

  if (route.auth === 'company') {
    parameters.push({ $ref: '#/components/parameters/CompanyId' })
  }

  if (route.idempotent) parameters.push({ $ref: '#/components/parameters/IdempotencyKey' })

  if (route.query) {
    const q = jsonSchema(route.query, 'input') as { properties?: Record<string, Json>; required?: string[] }

    for (const [name, schema] of Object.entries(q.properties ?? {})) {
      parameters.push({ name, in: 'query', required: q.required?.includes(name) ?? false, schema })
    }
  }

  return {
    tags: [route.tag],
    summary: route.summary,
    ...(route.capability ? { description: `Requires the \`${route.capability}\` capability.` } : {}),
    ...(route.auth === 'none' ? { security: [] } : { security: [{ bearerAuth: [] }] }),
    ...(parameters.length ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: jsonSchema(route.body, 'input') } },
          },
        }
      : {}),
    responses,
  }
}

/** The OpenAPI 3.0 document for every registered route, deterministic for diffing. */
export function buildOpenApiDocument(): Json {
  const paths: Record<string, Json> = {}

  const sorted = [...registeredRoutes()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  )

  for (const route of sorted) {
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method]: operation(route) }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Prodlys API',
      version: '1',
      description:
        'Mobile API. Sign in with POST /api/auth/sign-in/email and send the `set-auth-token` response header as `Authorization: Bearer <token>`. Tenant endpoints also need `X-Company-Id`. Success bodies are `{ data, meta? }`; errors are `{ error: { code, message, fields?, requestId } }`. Every response carries `X-Request-Id`.',
    },
    servers: [{ url: '/api/v1' }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      parameters: {
        CompanyId: {
          name: 'X-Company-Id',
          in: 'header',
          required: true,
          description: 'The company the request works in. The person must be able to open it.',
          schema: { type: 'string' },
        },
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Unique per intended action (8-128 chars). A retry replays the first response for 24 hours.',
          schema: { type: 'string' },
        },
      },
      schemas: { Error: errorSchema },
    },
  }
}

export function serializeOpenApiDocument(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`
}
