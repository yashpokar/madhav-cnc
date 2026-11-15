import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { assertAppVersion, compareVersions } from '@/lib/api/app-version'
import { isDeactivated, resolveCompanyId } from '@/lib/api/auth'
import { clampLimit, decodeCursor, encodeCursor, pageOf } from '@/lib/api/cursor'
import { errorBody, errorResponse, requestIdFrom, successBody } from '@/lib/api/envelope'
import { ApiError, DomainError, ERROR_STATUS, toApiError, unwrapService } from '@/lib/api/errors'
import { assertIfMatch, etagOf, matchesIfNoneMatch } from '@/lib/api/etag'
import {
  IDEMPOTENCY_TTL_MS,
  MemoryIdempotencyStore,
  cleanupIdempotencyKeys,
  hashRequest,
  parseIdempotencyKey,
  runIdempotent,
} from '@/lib/api/idempotency'
import { buildOpenApiDocument, serializeOpenApiDocument } from '@/lib/api/openapi/document'
import { MemoryRateLimitStore, RATE_LIMITS, enforceRateLimit, rateClassFor } from '@/lib/api/rate-limit'

// auth.ts pulls in the database client; only its pure helpers are used here.
vi.mock('@/lib/auth', () => ({ auth: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('error envelope', () => {
  it('maps every code to its status', () => {
    expect(ERROR_STATUS).toMatchObject({
      UNAUTHENTICATED: 401,
      ACCOUNT_DEACTIVATED: 403,
      FORBIDDEN: 403,
      COMPANY_REQUIRED: 400,
      COMPANY_NOT_ACCESSIBLE: 403,
      NOT_FOUND: 404,
      VALIDATION_FAILED: 422,
      CONFLICT: 409,
      PRECONDITION_FAILED: 412,
      IDEMPOTENCY_KEY_REUSED: 422,
      RATE_LIMITED: 429,
      UPGRADE_REQUIRED: 426,
      INTERNAL: 500,
    })
  })

  it('shapes an error body with fields and the request id', () => {
    const error = new ApiError('VALIDATION_FAILED', 'Bad', { fields: { name: 'Required' } })

    expect(errorBody(error, 'req-1')).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Bad', fields: { name: 'Required' }, requestId: 'req-1' },
    })
  })

  it('sets X-Request-Id, status and Retry-After', async () => {
    const res = errorResponse(new ApiError('RATE_LIMITED', 'Slow down', { retryAfter: 12.2 }), 'req-2')

    expect(res.status).toBe(429)
    expect(res.headers.get('x-request-id')).toBe('req-2')
    expect(res.headers.get('retry-after')).toBe('13')
    expect((await res.json()).error.requestId).toBe('req-2')
  })

  it('wraps success as { data, meta? }', () => {
    expect(successBody({ a: 1 })).toEqual({ data: { a: 1 } })
    expect(successBody([1], { next: 'x' })).toEqual({ data: [1], meta: { next: 'x' } })
  })

  it('passes domain errors through and hides everything else', () => {
    expect(toApiError(new DomainError('Nope', 'CONFLICT'))).toMatchObject({ code: 'CONFLICT', message: 'Nope' })

    const hidden = toApiError(new Error('select * from secrets'))

    expect(hidden.code).toBe('INTERNAL')
    expect(hidden.message).not.toContain('secrets')
  })

  it('unwraps service results', () => {
    expect(unwrapService({ ok: true as const, id: 1 }).id).toBe(1)
    expect(() => unwrapService({ ok: false as const, error: 'Used' })).toThrow(DomainError)
  })

  it('reuses a sane caller request id and replaces junk', () => {
    expect(requestIdFrom(new Headers({ 'x-request-id': 'abcdef-1234' }))).toBe('abcdef-1234')
    expect(requestIdFrom(new Headers({ 'x-request-id': 'bad id!' }))).not.toBe('bad id!')
  })
})

describe('cursor', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor({ k: '2026-01-01T00:00:00Z', id: 'abc' }))).toEqual({
      k: '2026-01-01T00:00:00Z',
      id: 'abc',
    })
    expect(decodeCursor(encodeCursor({ k: 42, id: 'x' }))).toEqual({ k: 42, id: 'x' })
  })

  it('rejects junk with VALIDATION_FAILED', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(ApiError)
    expect(() => decodeCursor(Buffer.from('{"a":1}').toString('base64url'))).toThrow(ApiError)
  })

  it('clamps the limit', () => {
    expect(clampLimit(undefined)).toBe(25)
    expect(clampLimit('abc')).toBe(25)
    expect(clampLimit('0')).toBe(25)
    expect(clampLimit('7')).toBe(7)
    expect(clampLimit('5000')).toBe(100)
  })

  it('pages and gives a cursor only when there is more', () => {
    const rows = [1, 2, 3].map((n) => ({ id: `i${n}`, n }))
    const page = pageOf(rows, 2, (r) => ({ k: r.n, id: r.id }))

    expect(page.items).toHaveLength(2)
    expect(decodeCursor(page.nextCursor as string)).toEqual({ k: 2, id: 'i2' })
    expect(pageOf(rows.slice(0, 2), 2, (r) => ({ k: r.n, id: r.id })).nextCursor).toBeNull()
  })
})

describe('etag', () => {
  it('is stable and changes with content', () => {
    expect(etagOf({ a: 1 })).toBe(etagOf({ a: 1 }))
    expect(etagOf({ a: 1 })).not.toBe(etagOf({ a: 2 }))
  })

  it('matches If-None-Match including weak tags and *', () => {
    const tag = etagOf({ a: 1 })
    const req = (h: Record<string, string>) => new Request('http://x', { headers: h })

    expect(matchesIfNoneMatch(req({ 'if-none-match': tag }), tag)).toBe(true)
    expect(matchesIfNoneMatch(req({ 'if-none-match': `W/${tag}` }), tag)).toBe(true)
    expect(matchesIfNoneMatch(req({ 'if-none-match': '*' }), tag)).toBe(true)
    expect(matchesIfNoneMatch(req({ 'if-none-match': '"other"' }), tag)).toBe(false)
    expect(matchesIfNoneMatch(req({}), tag)).toBe(false)
  })

  it('refuses a stale If-Match with 412 and allows a missing one', () => {
    const tag = etagOf({ v: 2 })

    expect(() => assertIfMatch(new Request('http://x'), tag)).not.toThrow()
    expect(() => assertIfMatch(new Request('http://x', { headers: { 'if-match': tag } }), tag)).not.toThrow()
    expect(() => assertIfMatch(new Request('http://x', { headers: { 'if-match': '"old"' } }), tag)).toThrowError(
      expect.objectContaining({ code: 'PRECONDITION_FAILED', status: 412 }),
    )
  })
})

describe('rate limit', () => {
  it('allows up to the limit then answers 429 with Retry-After, per subject', async () => {
    const store = new MemoryRateLimitStore()
    const now = 1_000_000
    const { limit } = RATE_LIMITS.upload

    for (let i = 0; i < limit; i += 1) await enforceRateLimit('u1', 'upload', now, store)

    await expect(enforceRateLimit('u1', 'upload', now + 1000, store)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter: 59,
    })
    // another user is unaffected
    await expect(enforceRateLimit('u2', 'upload', now, store)).resolves.toBeUndefined()
    // the window resets
    await expect(enforceRateLimit('u1', 'upload', now + 60_000, store)).resolves.toBeUndefined()
  })

  it('has the documented budgets', () => {
    expect(RATE_LIMITS.default.limit).toBe(120)
    expect(RATE_LIMITS.write.limit).toBe(30)
    expect(RATE_LIMITS.upload.limit).toBe(10)
    expect(rateClassFor('GET')).toBe('default')
    expect(rateClassFor('POST')).toBe('write')
    expect(rateClassFor('POST', true)).toBe('upload')
  })
})

describe('idempotency', () => {
  const scope = { userId: 'u', companyId: 'c', key: 'key-12345678' }
  const request = (body = '{}') => ({ method: 'POST', path: '/x', requestHash: hashRequest('POST', '/x', body) })

  it('runs once and replays the stored response', async () => {
    const store = new MemoryIdempotencyStore()
    let runs = 0
    const run = async () => ({ status: 201, body: { data: { n: ++runs } } })

    const first = await runIdempotent(store, scope, request(), run)
    const second = await runIdempotent(store, scope, request(), run)

    expect(first.replayed).toBe(false)
    expect(second).toMatchObject({ replayed: true, status: 201, body: { data: { n: 1 } } })
    expect(runs).toBe(1)
  })

  it('refuses the same key with a different request (422)', async () => {
    const store = new MemoryIdempotencyStore()

    await runIdempotent(store, scope, request('{"a":1}'), async () => ({ status: 200, body: {} }))
    await expect(
      runIdempotent(store, scope, request('{"a":2}'), async () => ({ status: 200, body: {} })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 })
  })

  it('keeps keys apart per user and per company', async () => {
    const store = new MemoryIdempotencyStore()
    let runs = 0
    const run = async () => ({ status: 200, body: ++runs })

    await runIdempotent(store, scope, request(), run)
    await runIdempotent(store, { ...scope, companyId: 'other' }, request(), run)
    await runIdempotent(store, { ...scope, userId: 'other' }, request(), run)

    expect(runs).toBe(3)
  })

  it('does not remember failures, so the retry runs again', async () => {
    const store = new MemoryIdempotencyStore()
    let runs = 0

    await expect(
      runIdempotent(store, scope, request(), async () => {
        runs += 1
        throw new ApiError('VALIDATION_FAILED', 'bad')
      }),
    ).rejects.toThrow()

    const ok = await runIdempotent(store, scope, request(), async () => ({ status: 200, body: ++runs }))

    expect(ok.replayed).toBe(false)
    expect(runs).toBe(2)
  })

  it('answers 409 while the first request is still running', async () => {
    const store = new MemoryIdempotencyStore()
    let release: () => void = () => {}
    const slow = runIdempotent(store, scope, request(), () => new Promise((r) => (release = () => r({ status: 200, body: 1 }))))

    await Promise.resolve()
    await expect(runIdempotent(store, scope, request(), async () => ({ status: 200, body: 2 }))).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    release()
    await slow
  })

  it('stops replaying after the 24h TTL and cleans up old rows', async () => {
    const store = new MemoryIdempotencyStore()
    const t0 = new Date('2026-01-01T00:00:00Z')
    let runs = 0
    const run = async () => ({ status: 200, body: ++runs })

    await runIdempotent(store, scope, request(), run, t0)

    const within = await runIdempotent(store, scope, request(), run, new Date(t0.getTime() + IDEMPOTENCY_TTL_MS - 1))

    expect(within.replayed).toBe(true)

    const after = await runIdempotent(store, scope, request(), run, new Date(t0.getTime() + IDEMPOTENCY_TTL_MS))

    expect(after.replayed).toBe(false)
    expect(runs).toBe(2)

    await runIdempotent(store, { ...scope, key: 'key-87654321' }, request(), run, t0)
    expect(await cleanupIdempotencyKeys(store, new Date(t0.getTime() + IDEMPOTENCY_TTL_MS + 1000))).toBe(1)
  })

  it('validates the key format', () => {
    expect(parseIdempotencyKey(null)).toBeNull()
    expect(parseIdempotencyKey('0b1c2d3e-aaaa')).toBe('0b1c2d3e-aaaa')
    expect(() => parseIdempotencyKey('short')).toThrow(ApiError)
  })
})

describe('app version gate and account helpers', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1)
  })

  it('answers 426 for an app below the platform minimum, and ignores requests without app headers', () => {
    const env = { PRODLYS_MIN_APP_VERSION_IOS: '1.2.0', PRODLYS_MIN_APP_VERSION_ANDROID: '2.0.0' }
    const h = (platform: string, version: string) => new Headers({ 'x-platform': platform, 'x-app-version': version })

    expect(() => assertAppVersion(h('ios', '1.1.9'), env)).toThrowError(expect.objectContaining({ code: 'UPGRADE_REQUIRED', status: 426 }))
    expect(() => assertAppVersion(h('ios', '1.2.0'), env)).not.toThrow()
    expect(() => assertAppVersion(h('android', '1.9.0'), env)).toThrow()
    expect(() => assertAppVersion(new Headers(), env)).not.toThrow()
  })

  it('tells a deactivated account from a brand-new one', () => {
    expect(isDeactivated({ isActive: false, activatedAt: new Date() })).toBe(true)
    expect(isDeactivated({ isActive: false, activatedAt: null })).toBe(false)
    expect(isDeactivated({ isActive: true, activatedAt: new Date() })).toBe(false)
  })

  it('resolves a company only from the ones the person may open', () => {
    const mine = [{ id: 'a' }, { id: 'b' }]

    expect(resolveCompanyId(mine, ' b ')).toBe('b')
    expect(() => resolveCompanyId(mine, null)).toThrowError(expect.objectContaining({ code: 'COMPANY_REQUIRED' }))
    expect(() => resolveCompanyId(mine, 'zzz')).toThrowError(expect.objectContaining({ code: 'COMPANY_NOT_ACCESSIBLE' }))
    expect(() => resolveCompanyId([], 'a')).toThrowError(expect.objectContaining({ code: 'COMPANY_NOT_ACCESSIBLE' }))
  })
})

describe('openapi', () => {
  it('matches the committed openapi/prodlys-v1.json (run `pnpm openapi:generate` if this fails)', () => {
    expect(readFileSync('openapi/prodlys-v1.json', 'utf8')).toBe(serializeOpenApiDocument())
  })

  it('documents every route file under src/app/api/v1', () => {
    const root = 'src/app/api/v1'
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)

        if (statSync(full).isDirectory()) walk(full)
        else if (name === 'route.ts') files.push(full)
      }
    }

    expect(existsSync(root)).toBe(true)
    walk(root)

    const paths = Object.keys(buildOpenApiDocument().paths as object)

    for (const file of files) {
      const path = `/${file.slice(root.length + 1, -'/route.ts'.length)}`.replace(/\[(\w+)\]/g, '{$1}')

      expect(paths, `${file} has no OpenAPI entry`).toContain(path)
    }
  })
})
