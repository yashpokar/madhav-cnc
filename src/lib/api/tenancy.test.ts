import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// DB-free: the session, the company list and memberships are faked, so these
// check the wrapper's tenancy rules and the ALS context end to end.

type FakeUser = { id: string; role: string; isActive: boolean; activatedAt: Date | null }

const users: Record<string, FakeUser> = {
  'token-a': { id: 'ua', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-viewer': { id: 'uv', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-sales': { id: 'us', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-admin': { id: 'root', role: 'ADMIN', isActive: true, activatedAt: new Date() },
  'token-off': { id: 'off', role: 'ADMIN', isActive: false, activatedAt: new Date() },
}

const companies = [
  { id: 'cA', companyName: 'A' },
  { id: 'cB', companyName: 'B' },
]

// who belongs where, and the per-company role
const membership: Record<string, Record<string, string | null>> = {
  ua: { cA: null },
  uv: { cA: 'VIEWER' },
  us: { cA: 'SALES' },
  off: { cA: null },
}

function tokenOf(headers: Headers) {
  return headers.get('authorization')?.replace('Bearer ', '') ?? ''
}

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const user = users[tokenOf(headers)]

        return user ? { user: { ...user, name: user.id, email: `${user.id}@x`, image: null } } : null
      },
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companySetting: {
      findMany: async (args: { where: { access?: { some: { userId: string } } } }) => {
        const userId = args.where.access?.some.userId

        return userId ? companies.filter((c) => c.id in (membership[userId] ?? {})) : companies
      },
    },
    userCompany: {
      findUnique: async (args: { where: { userId_companyId: { userId: string; companyId: string } } }) => {
        const { userId, companyId } = args.where.userId_companyId
        const row = membership[userId]

        return row && companyId in row ? { role: row[companyId] } : null
      },
    },
  },
}))

// getCompanyScope asks the session layer who is signed in. Use the request's bearer token.
let currentToken = ''

vi.mock('@/lib/session', () => ({
  getBaseUser: async () => {
    const user = users[currentToken]

    return user ? { id: user.id, isSuperAdmin: user.role === 'ADMIN', isActive: user.isActive } : null
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'cB' }) }), // the web cookie points at company B
}))

const { apiRoute, reply, NO_PARAMS } = await import('@/lib/api/handler')
const { getCompanyScope } = await import('@/lib/active-company')

function call(
  handler: (request: Request, context: typeof NO_PARAMS) => Promise<Response>,
  token: string,
  init: { company?: string; method?: string; body?: unknown } = {},
) {
  currentToken = token

  const headers = new Headers({ authorization: `Bearer ${token}` })

  if (init.company !== undefined) headers.set('x-company-id', init.company)

  return handler(
    new Request('http://localhost/api/v1/test', {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    NO_PARAMS,
  )
}

// A fake "table" read through the scope, like the Prisma extension does.
const rows = [
  { id: 'r1', companyId: 'cA', title: 'in A' },
  { id: 'r2', companyId: 'cB', title: 'in B' },
]

async function findRow(id: string) {
  const scope = await getCompanyScope()

  return scope.kind === 'company' ? rows.find((r) => r.id === id && r.companyId === scope.companyId) : undefined
}

const readRow = apiRoute({ auth: 'company' }, async ({ request }) => {
  const row = await findRow(new URL(request.url).searchParams.get('id') ?? '')

  if (!row) {
    const { ApiError } = await import('@/lib/api/errors')

    throw new ApiError('NOT_FOUND', 'Not found')
  }

  return row
})

const createRow = apiRoute(
  { auth: 'company', capability: 'customer:create', body: z.object({ title: z.string(), companyId: z.string().optional() }) },
  async ({ body, companyId }) => reply({ title: body.title, companyId }, { status: 201 }),
)

async function json(response: Response) {
  return (await response.json()) as {
    data?: Record<string, unknown> & { title?: string; companyId?: string; asked?: string; scope?: unknown }
    error?: { code: string; requestId: string; message: string }
  }
}

beforeEach(() => {
  currentToken = ''
})

describe('API tenancy', () => {
  it('403 COMPANY_NOT_ACCESSIBLE for a company the person is not in, with no data', async () => {
    const res = await call(readRow, 'token-a', { company: 'cB' })
    const body = await json(res)

    expect(res.status).toBe(403)
    expect(body.error?.code).toBe('COMPANY_NOT_ACCESSIBLE')
    expect(body.data).toBeUndefined()
  })

  it('answers 403, not 404, for a company that does not exist', async () => {
    const res = await call(readRow, 'token-a', { company: 'nope' })

    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('COMPANY_NOT_ACCESSIBLE')

    const admin = await call(readRow, 'token-admin', { company: 'nope' })

    expect(admin.status).toBe(403)
  })

  it('lets a super-admin pass any existing company', async () => {
    const res = await call(readRow, 'token-admin', { company: 'cB' + '' })

    // the row r2 lives in cB; the id is passed in the query string
    const withRow = await (async () => {
      currentToken = 'token-admin'

      return readRow(
        new Request('http://localhost/api/v1/test?id=r2', {
          headers: { authorization: 'Bearer token-admin', 'x-company-id': 'cB' },
        }),
        NO_PARAMS,
      )
    })()

    expect(res.status).toBe(404) // company accepted; no row with an empty id
    expect(withRow.status).toBe(200)
    expect((await json(withRow)).data!.title).toBe('in B')
  })

  it("404 for company B's record read with company A's header", async () => {
    currentToken = 'token-a'

    const res = await readRow(
      new Request('http://localhost/api/v1/test?id=r2', {
        headers: { authorization: 'Bearer token-a', 'x-company-id': 'cA' },
      }),
      NO_PARAMS,
    )

    expect(res.status).toBe(404)
  })

  it('403 FORBIDDEN for a VIEWER calling a create endpoint', async () => {
    const res = await call(createRow, 'token-viewer', { company: 'cA', method: 'POST', body: { title: 'x' } })

    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('FORBIDDEN')
  })

  it('lets a per-company SALES role create even though the global role is VIEWER', async () => {
    const res = await call(createRow, 'token-sales', { company: 'cA', method: 'POST', body: { title: 'x' } })

    expect(res.status).toBe(201)
  })

  it('403 ACCOUNT_DEACTIVATED for a deactivated user with a valid token', async () => {
    const res = await call(readRow, 'token-off', { company: 'cA' })

    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('ACCOUNT_DEACTIVATED')
  })

  it('401 UNAUTHENTICATED without a valid token', async () => {
    const res = await call(readRow, 'nobody', { company: 'cA' })

    expect(res.status).toBe(401)
    expect((await json(res)).error?.code).toBe('UNAUTHENTICATED')
  })

  it('400 COMPANY_REQUIRED when the header is missing on a tenant endpoint', async () => {
    const res = await call(readRow, 'token-a')

    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('COMPANY_REQUIRED')
  })

  it('uses the header, not the cookie, when they disagree', async () => {
    // The mocked web cookie says cB; the header says cA, and the person is only in cA.
    const seen = apiRoute({ auth: 'company' }, async ({ companyId }) => ({
      companyId,
      scope: await getCompanyScope(),
    }))

    const res = await call(seen, 'token-a', { company: 'cA' })

    expect((await json(res)).data).toEqual({ companyId: 'cA', scope: { kind: 'company', companyId: 'cA' } })
  })

  it('keeps concurrent requests for different companies apart', async () => {
    const seen = apiRoute({ auth: 'company' }, async ({ companyId }) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))

      const scope = await getCompanyScope()

      return { asked: companyId, scope: scope.kind === 'company' ? scope.companyId : null }
    })

    // the admin may open both; fire many interleaved requests
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => call(seen, 'token-admin', { company: i % 2 ? 'cA' : 'cB' })),
    )

    for (const res of results) {
      const { asked, scope } = (await json(res)).data!

      expect(scope).toBe(asked)
    }
  })

  it('takes companyId from the scope on writes, never from the body', async () => {
    const res = await call(createRow, 'token-sales', {
      company: 'cA',
      method: 'POST',
      body: { title: 'sneaky', companyId: 'cB' },
    })

    expect((await json(res)).data!.companyId).toBe('cA')
  })

  it('a user-level route sees no company (never the first one)', async () => {
    const seen = apiRoute({ auth: 'user' }, async () => getCompanyScope())
    const res = await call(seen, 'token-a')

    expect((await json(res)).data).toEqual({ kind: 'none' })
  })

  it('every response carries X-Request-Id and error bodies repeat it', async () => {
    const res = await call(readRow, 'token-a', { company: 'cB' })
    const body = await json(res)

    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(body.error?.requestId).toBe(res.headers.get('x-request-id'))
  })
})
