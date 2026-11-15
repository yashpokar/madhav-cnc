import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore, setRateLimitStore } from '@/lib/api/rate-limit'

// DB-free, like writes.test.ts: the session, memberships and services are faked,
// so this checks what the account routes add (capability, validation, error
// mapping, other-company 404, idempotent replay, search and export gating).

const users: Record<string, { id: string; role: string }> = {
  'token-admin': { id: 'ua', role: 'VIEWER' },
  'token-viewer': { id: 'uv', role: 'VIEWER' },
}

const membership: Record<string, Record<string, string>> = {
  ua: { cA: 'ADMIN' },
  uv: { cA: 'VIEWER' },
}

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const user = users[headers.get('authorization')?.replace('Bearer ', '') ?? '']

        return user
          ? { user: { ...user, name: user.id, email: `${user.id}@x`, image: null, isActive: true, activatedAt: new Date() } }
          : null
      },
    },
  },
}))

vi.mock('@/lib/session', () => ({ getBaseUser: async () => null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companySetting: {
      findMany: async (args: { where: { access?: { some: { userId: string } } } }) => {
        const userId = args.where.access?.some.userId

        return Object.keys(membership[userId ?? ''] ?? {}).map((id) => ({ id, companyName: id }))
      },
    },
    userCompany: {
      findUnique: async (args: { where: { userId_companyId: { userId: string; companyId: string } } }) => {
        const { userId, companyId } = args.where.userId_companyId
        const role = membership[userId]?.[companyId]

        return role ? { role } : null
      },
    },
  },
}))

vi.mock('@/lib/api/idempotency-store', async () => {
  const { MemoryIdempotencyStore: Store } = await import('@/lib/api/idempotency')

  return { prismaIdempotencyStore: new Store() }
})

const calls = vi.hoisted(() => ({ list: [] as string[] }))

const member = { id: 'm1', name: 'Mira', email: 'mira@x.com', role: 'SALES', isSuperAdmin: false }

const invitationRow = {
  id: 'inv1',
  token: 'abcdefghijklmnopqrstuvwxyz234567',
  role: 'SALES',
  email: null,
  phone: '9876543210',
  note: null,
  status: 'PENDING',
  expiresAt: new Date('2026-12-01T00:00:00Z'),
  createdAt: new Date('2026-11-15T00:00:00Z'),
}

vi.mock('@/lib/services/team', () => ({
  listTeamMembers: async () => [member],
  listInvitations: async () => [invitationRow],
  addMemberFor: async (_actor: unknown, _company: string, email: string) => {
    calls.list.push('addMemberFor')

    return email === 'nobody@x.com'
      ? { ok: false, error: 'They need to sign up first', code: 'VALIDATION_FAILED', fieldErrors: { email: 'They need to sign up first' } }
      : { ok: true, message: 'added' }
  },
  changeMemberRoleFor: async (_a: unknown, _c: string, userId: string) => {
    calls.list.push('changeMemberRoleFor')

    return userId === 'cB-9' ? { ok: false, error: 'That person is not on this team', code: 'NOT_FOUND' } : { ok: true, message: 'ok' }
  },
  removeMemberFor: async (_a: unknown, _c: string, userId: string) => {
    calls.list.push('removeMemberFor')

    return userId === 'cB-9' ? { ok: false, error: 'That person is not on this team', code: 'NOT_FOUND' } : { ok: true, message: 'removed' }
  },
  inviteFor: async () => {
    calls.list.push('inviteFor')

    return { ok: true, message: 'Invitation created', invitation: invitationRow }
  },
  revokeInviteFor: async (_a: unknown, _c: string, id: string) => {
    calls.list.push('revokeInviteFor')

    return id === 'cB-1' ? { ok: false, error: 'That invitation is no longer open' } : { ok: true, message: 'revoked' }
  },
  regenerateInviteFor: async () => {
    calls.list.push('regenerateInviteFor')

    return { ok: true, message: 'New link ready', invitation: invitationRow }
  },
}))

vi.mock('@/lib/services/billing', () => ({
  listBillingPayments: async () => [],
  createCheckoutOrder: async (input: { plan: string }) => {
    calls.list.push('createCheckoutOrder')

    return { ok: true, paymentId: 'pay1', redirectUrl: `https://pay/${input.plan}` }
  },
}))

vi.mock('@/lib/services/search', () => ({
  searchFor: async (role: string, q: string) => {
    calls.list.push(`search:${role}:${q}`)

    return [{ id: 'c-cust1', group: 'Customers', title: 'Asha', subtitle: 'C-1 · 98' }]
  },
}))

vi.mock('@/lib/services/export', () => ({
  EXPORT_RESOURCE: { customers: 'customer', stock: 'stock' },
  buildSheet: async () => ({ headers: ['Name'], rows: [['Asha']] }),
}))

vi.mock('@/lib/queries/company', () => ({ getCompanySetting: async () => ({ companyName: 'Acme' }) }))
vi.mock('@/lib/services/invitations', () => ({
  getPublicInvitation: async (token: string) =>
    token === 'good'
      ? { companyName: 'Acme', role: 'SALES', inviterName: 'Asha', emailHint: null, expiresAt: new Date('2026-12-01T00:00:00Z'), status: 'PENDING' }
      : null,
}))

type Handler = (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>

const routes = import.meta.glob('../../app/api/v1/**/route.ts') as Record<string, () => Promise<Record<string, Handler>>>

type Init = { token?: string; company?: string; body?: unknown; key?: string; params?: Record<string, string> }

const call = async (file: string, method: string, path: string, init: Init = {}) => {
  const route = await routes[`../../app/api/v1/${file}.ts`]()
  const headers: Record<string, string> = {
    authorization: `Bearer ${init.token ?? 'token-admin'}`,
    'x-company-id': init.company ?? 'cA',
    'content-type': 'application/json',
  }

  if (init.key) headers['idempotency-key'] = init.key

  const request = new Request(`http://x/api/v1${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const response = await route[method](request, { params: Promise.resolve(init.params ?? {}) })
  const text = await response.text()

  return {
    response,
    text,
    json: (text.startsWith('{') ? JSON.parse(text) : {}) as { data?: unknown; error?: { code: string; fields?: Record<string, string> } },
  }
}

beforeEach(() => {
  calls.list.length = 0
  setRateLimitStore(new MemoryRateLimitStore())
})

describe('team and invitations: capability user:update', () => {
  const cases: [string, string, string, string, Init][] = [
    ['team/members/route', 'GET', '/team/members', '', {}],
    ['team/members/route', 'POST', '/team/members', '', { body: { email: 'mira@x.com', role: 'SALES' } }],
    ['team/members/[userId]/route', 'PATCH', '/team/members/m1', '', { body: { role: 'SALES' }, params: { userId: 'm1' } }],
    ['team/members/[userId]/route', 'DELETE', '/team/members/m1', '', { params: { userId: 'm1' } }],
    ['invitations/route', 'GET', '/invitations', '', {}],
    ['invitations/route', 'POST', '/invitations', '', { body: { role: 'SALES' } }],
    ['invitations/[id]/route', 'DELETE', '/invitations/inv1', '', { params: { id: 'inv1' } }],
    ['invitations/[id]/regenerate/route', 'POST', '/invitations/inv1/regenerate', '', { params: { id: 'inv1' } }],
    ['billing/payments/route', 'GET', '/billing/payments', '', {}],
    ['billing/checkout/route', 'POST', '/billing/checkout', '', { body: { plan: 'BUSINESS' } }],
  ]

  it.each(cases)('%s %s is 403 for a viewer and runs for an administrator', async (file, method, path, _x, init) => {
    const denied = await call(file, method, path, { ...init, token: 'token-viewer' })

    expect(denied.response.status).toBe(403)
    expect(denied.json.error?.code).toBe('FORBIDDEN')
    expect(calls.list).toEqual([])

    const ok = await call(file, method, path, init)

    expect(ok.response.status).toBeLessThan(300)
  })
})

describe('team members', () => {
  it('lists the members', async () => {
    const { json } = await call('team/members/route', 'GET', '/team/members')

    expect(json.data).toEqual([member])
  })

  it('is 422 for a bad email or role, and 422 on the email when no account exists', async () => {
    const bad = await call('team/members/route', 'POST', '/team/members', { body: { email: 'nope', role: 'SALES' } })

    expect(bad.response.status).toBe(422)
    expect(Object.keys(bad.json.error?.fields ?? {})).toContain('email')

    const role = await call('team/members/route', 'POST', '/team/members', { body: { email: 'a@x.com', role: 'BOSS' } })

    expect(role.response.status).toBe(422)

    const nobody = await call('team/members/route', 'POST', '/team/members', { body: { email: 'nobody@x.com', role: 'SALES' } })

    expect(nobody.response.status).toBe(422)
    expect(nobody.json.error?.fields?.email).toBeTruthy()
  })

  it('replays an add with the same Idempotency-Key without running it again', async () => {
    const body = { email: 'mira@x.com', role: 'SALES' }
    const first = await call('team/members/route', 'POST', '/team/members', { body, key: 'member-key-1' })
    const second = await call('team/members/route', 'POST', '/team/members', { body, key: 'member-key-1' })

    expect(first.response.status).toBe(201)
    expect(second.response.headers.get('Idempotent-Replayed')).toBe('true')
    expect(second.json).toEqual(first.json)
    expect(calls.list).toEqual(['addMemberFor'])
  })

  it("is 404 for a person of another company (change role and remove) and 422 for a bad role", async () => {
    const patch = await call('team/members/[userId]/route', 'PATCH', '/team/members/cB-9', { body: { role: 'SALES' }, params: { userId: 'cB-9' } })
    const del = await call('team/members/[userId]/route', 'DELETE', '/team/members/cB-9', { params: { userId: 'cB-9' } })
    const bad = await call('team/members/[userId]/route', 'PATCH', '/team/members/m1', { body: { role: 'KING' }, params: { userId: 'm1' } })

    expect(patch.response.status).toBe(404)
    expect(del.response.status).toBe(404)
    expect(bad.response.status).toBe(422)
  })
})

describe('invitations', () => {
  it('answers each invitation with the link and the WhatsApp message', async () => {
    const { json } = await call('invitations/route', 'POST', '/invitations', { body: { role: 'SALES', phone: '9876543210' } })
    const data = json.data as { url: string; whatsappText: string; whatsappLink: string; token: string }

    expect(data.url).toContain('/join/abcdefghijklmnopqrstuvwxyz234567')
    expect(data.whatsappText).toContain('Acme')
    expect(data.whatsappLink).toContain('https://wa.me/919876543210?text=')
  })

  it('is 422 for an invalid role and replays on the same key', async () => {
    const bad = await call('invitations/route', 'POST', '/invitations', { body: { role: 'KING' } })

    expect(bad.response.status).toBe(422)

    const first = await call('invitations/route', 'POST', '/invitations', { body: { role: 'SALES' }, key: 'invite-key-1' })
    const second = await call('invitations/route', 'POST', '/invitations', { body: { role: 'SALES' }, key: 'invite-key-1' })

    expect(first.response.status).toBe(201)
    expect(second.response.headers.get('Idempotent-Replayed')).toBe('true')
    expect(calls.list.filter((c) => c === 'inviteFor')).toHaveLength(1)
  })

  it('refuses a revoke of an invitation that is not open with 409', async () => {
    const { response, json } = await call('invitations/[id]/route', 'DELETE', '/invitations/cB-1', { params: { id: 'cB-1' } })

    expect(response.status).toBe(409)
    expect(json.error?.code).toBe('CONFLICT')
  })

  it('previews by token (404 for an unknown one) for any signed-in person', async () => {
    const good = await call('invitations/preview/route', 'GET', '/invitations/preview?token=good', { token: 'token-viewer' })
    const bad = await call('invitations/preview/route', 'GET', '/invitations/preview?token=nope')
    const missing = await call('invitations/preview/route', 'GET', '/invitations/preview')

    expect(good.response.status).toBe(200)
    expect(good.json.data).toMatchObject({ companyName: 'Acme', usable: true })
    expect(bad.response.status).toBe(404)
    expect(missing.response.status).toBe(422)
  })
})

describe('billing', () => {
  it('starts a checkout, 422 for an unknown plan, and replays on the same key', async () => {
    const bad = await call('billing/checkout/route', 'POST', '/billing/checkout', { body: { plan: 'FREE' } })

    expect(bad.response.status).toBe(422)

    const first = await call('billing/checkout/route', 'POST', '/billing/checkout', { body: { plan: 'BUSINESS' }, key: 'checkout-key-1' })
    const second = await call('billing/checkout/route', 'POST', '/billing/checkout', { body: { plan: 'BUSINESS' }, key: 'checkout-key-1' })

    expect(first.json.data).toEqual({ paymentId: 'pay1', redirectUrl: 'https://pay/BUSINESS' })
    expect(second.response.headers.get('Idempotent-Replayed')).toBe('true')
    expect(calls.list).toEqual(['createCheckoutOrder'])
  })
})

describe('industries, search and export', () => {
  it('lists the industry templates with an ETag and answers 304 to a matching If-None-Match', async () => {
    const first = await call('industries/route', 'GET', '/industries')
    const etag = first.response.headers.get('etag') ?? ''
    const list = first.json.data as { key: string; modules: object; terms: object }[]

    expect(list.map((i) => i.key)).toContain('SALON')
    expect(list[0]).toHaveProperty('modules')
    expect(list[0]).toHaveProperty('terms')
    expect(etag).toMatch(/^"/)

    const route = await routes['../../app/api/v1/industries/route.ts']()
    const again = await route.GET(
      new Request('http://x/api/v1/industries', { headers: { authorization: 'Bearer token-admin', 'if-none-match': etag } }),
      { params: Promise.resolve({}) },
    )

    expect(again.status).toBe(304)
  })

  it('searches with the role in the company and says which record a hit opens', async () => {
    const { response, json } = await call('search/route', 'GET', '/search?q=asha', { token: 'token-viewer' })

    expect(response.status).toBe(200)
    expect(json.data).toEqual([expect.objectContaining({ type: 'customer', recordId: 'cust1' })])
    expect(calls.list).toEqual(['search:VIEWER:asha'])
  })

  it('exports CSV for a kind the role may read, 404 for an unknown kind', async () => {
    const ok = await call('export/[kind]/route', 'GET', '/export/customers', { params: { kind: 'customers' } })

    expect(ok.response.status).toBe(200)
    expect(ok.response.headers.get('content-type')).toContain('text/csv')
    expect(ok.text).toContain('Name')
    expect(ok.text).toContain('Asha')

    const unknown = await call('export/[kind]/route', 'GET', '/export/secrets', { params: { kind: 'secrets' } })

    expect(unknown.response.status).toBe(404)
  })
})
