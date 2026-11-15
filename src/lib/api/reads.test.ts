import { beforeEach, describe, expect, it, vi } from 'vitest'

// DB-free: the session, memberships and the read queries are faked (the queries
// read a fake table through the real company scope), so these check what the
// read routes add: capability gating, tenancy, paging and the wire shapes.

type FakeUser = { id: string; role: string; isActive: boolean; activatedAt: Date | null }

const users: Record<string, FakeUser> = {
  'token-admin': { id: 'ua', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-operator': { id: 'uo', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-accountant': { id: 'uc', role: 'VIEWER', isActive: true, activatedAt: new Date() },
  'token-b': { id: 'ub', role: 'ADMIN', isActive: true, activatedAt: new Date() },
}

const companies = [
  { id: 'cA', companyName: 'A' },
  { id: 'cB', companyName: 'B' },
]

const membership: Record<string, Record<string, string | null>> = {
  ua: { cA: 'ADMIN' },
  uo: { cA: 'OPERATOR' },
  uc: { cA: 'ACCOUNTANT' },
  ub: { cB: 'ADMIN' },
}

const bearer = (headers: Headers) => headers.get('authorization')?.replace('Bearer ', '') ?? ''
let currentToken = ''

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const user = users[bearer(headers)]

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

vi.mock('@/lib/session', () => ({
  getBaseUser: async () => {
    const user = users[currentToken]

    return user ? { id: user.id, isSuperAdmin: user.role === 'ADMIN', isActive: user.isActive } : null
  },
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

// ---- fake read models -----------------------------------------------------

type Row = { id: string; companyId: string; createdAt: Date }

const customerRows: Row[] = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `c${i}`,
    companyId: 'cA',
    // two share a timestamp to exercise the id tie-break
    createdAt: new Date(Date.UTC(2026, 0, 10 - Math.floor(i / 2))),
  })),
  { id: 'other', companyId: 'cB', createdAt: new Date(Date.UTC(2026, 0, 1)) },
]

const customerOf = (row: Row) => ({
  id: row.id,
  code: `C-${row.id}`,
  name: `Customer ${row.id}`,
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  phone: '9999999999',
  email: null,
  city: 'Surat',
  state: 'Gujarat',
  pincode: null,
  address: null,
  altPhone: null,
  gstin: null,
  pan: null,
  dateOfBirth: null,
  anniversaryDate: null,
  paymentTermsDays: null,
  notes: null,
  openingDue: { toNumber: () => 0 },
  openingAsOf: null,
  preferredArchitect: null,
  preferredCarpenter: null,
  createdAt: row.createdAt,
  updatedAt: row.createdAt,
})

const { getCompanyScope } = await import('@/lib/active-company')

const calls = { listCustomers: [] as unknown[], customerAccount: 0 }

vi.mock('@/lib/queries/customers', () => ({
  listCustomers: async (args: { page: { take: number; after?: { k: string; id: string } | null } }) => {
    calls.listCustomers.push(args.page)

    const scope = await getCompanyScope()
    const mine = customerRows
      .filter((r) => scope.kind === 'company' && r.companyId === scope.companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    const after = args.page.after
    const rest = after
      ? mine.filter(
          (r) =>
            r.createdAt.toISOString() < after.k || (r.createdAt.toISOString() === after.k && r.id < after.id),
        )
      : mine

    return rest.slice(0, args.page.take).map(customerOf)
  },
  getCustomer: async (id: string) => {
    const scope = await getCompanyScope()
    const row = customerRows.find((r) => r.id === id && scope.kind === 'company' && r.companyId === scope.companyId)

    return row ? customerOf(row) : null
  },
}))

vi.mock('@/lib/queries/payments', () => ({
  customerAccount: async () => {
    calls.customerAccount += 1

    return {
      due: 1500.5,
      invoiceDue: 1500.5,
      opening: 0,
      onAccount: 0,
      credit: 0,
      creditNotesTotal: 0,
      net: 1500.5,
      invoices: [
        {
          id: 'i1',
          number: 'INV-1',
          invoiceDate: new Date('2026-01-01T00:00:00Z'),
          dueDate: new Date('2026-01-31T00:00:00Z'),
          total: 2000,
          due: 1500.5,
        },
      ],
    }
  },
  getReceipt: async () => null,
}))

vi.mock('@/lib/queries/accounting', () => ({
  listExpenses: async () => [],
  getExpense: async () => null,
  listExpenseCategories: async () => [{ id: 'k1', name: 'Fuel', sortOrder: 1, isActive: true }],
}))

vi.mock('@/lib/queries/invoices', () => ({ listInvoices: async () => [], getInvoice: async () => null }))
vi.mock('@/lib/queries/production', () => ({ listBoardTasks: async () => [] }))
vi.mock('@/lib/api/reads/payments', () => ({ listPayments: async () => [] }))

vi.mock('@/lib/queries/calendar', () => ({
  listCalendarItems: async ({ layers }: { layers: string[] }) => [{ kind: 'layers', id: layers.join(',') }],
  listCalendarEntries: async () => [
    {
      kind: 'order',
      id: 'o1',
      number: 'ORD-1',
      status: 'CONFIRMED',
      subject: null,
      customerName: 'X',
      customerPhone: null,
      venue: null,
      headcount: null,
      startsAt: null,
      endsAt: null,
      dueDate: '2026-11-16T00:00:00.000Z',
      orderDate: '2026-11-01T00:00:00.000Z',
      total: 100,
      received: 40,
      balance: 60,
    },
  ],
}))

vi.mock('@/lib/queries/dashboard', () => ({
  getOrderWatch: async () => ({ overdue: 1, dueThisWeek: 2, openCount: 5, readyToDispatch: 3, list: [] }),
  getPeriodActivity: async () => ({
    current: { received: 5000.5, receivedCount: 2, spent: 100, billed: 12345.5, billedCount: 3 },
    previous: {},
    series: null,
  }),
}))
vi.mock('@/lib/queries/receivables', () => ({
  getReceivables: async () => ({ outstanding: 900.1, overdue: 200, totalDue: 1000 }),
}))
vi.mock('@/lib/queries/payables', () => ({ getPayables: async () => ({ totalPayable: 77 }) }))
vi.mock('@/lib/queries/stock', () => ({ countLowStock: async () => 4 }))
vi.mock('@/lib/queries/payment-modes', () => ({
  listPaymentModeOptions: async () => [{ id: 'm1', name: 'PhonePe', kind: 'UPI' }],
}))

const { NO_PARAMS } = await import('@/lib/api/handler')
const customersList = (await import('@/app/api/v1/customers/route')).GET
const customerOne = (await import('@/app/api/v1/customers/[id]/route')).GET
const invoicesList = (await import('@/app/api/v1/invoices/route')).GET
const calendar = (await import('@/app/api/v1/calendar/route')).GET
const dashboard = (await import('@/app/api/v1/dashboard/summary/route')).GET
const methods = (await import('@/app/api/v1/payment-methods/route')).GET
const states = (await import('@/app/api/v1/states/route')).GET
const productionTasks = (await import('@/app/api/v1/production/tasks/route')).GET
const expenseCategories = (await import('@/app/api/v1/expense-categories/route')).GET

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

function call(
  handler: Handler,
  token: string,
  { company = 'cA', path = '/api/v1/x', params = {}, headers = {} }: {
    company?: string | null
    path?: string
    params?: Record<string, string>
    headers?: Record<string, string>
  } = {},
) {
  currentToken = token

  const h = new Headers({ authorization: `Bearer ${token}`, ...headers })

  if (company) h.set('x-company-id', company)

  return handler(new Request(`http://localhost${path}`, { headers: h }), { params: Promise.resolve(params) })
}

type Body = {
  data?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  meta?: { nextCursor: string | null; hasMore: boolean }
  error?: { code: string }
}

const json = async (res: Response) => (await res.json()) as Body

beforeEach(() => {
  currentToken = ''
  calls.listCustomers.length = 0
  calls.customerAccount = 0
})

describe('read endpoints: permissions', () => {
  it('403 FORBIDDEN for a role without the capability (operator: no invoice:read)', async () => {
    const res = await call(invoicesList, 'token-operator', { path: '/api/v1/invoices' })

    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('FORBIDDEN')
  })

  it('an operator (customer:read) can list customers', async () => {
    const res = await call(customersList, 'token-operator', { path: '/api/v1/customers' })

    expect(res.status).toBe(200)
  })

  it('does not run the query when the capability is missing', async () => {
    await call(invoicesList, 'token-operator', { path: '/api/v1/invoices?limit=5' })

    expect(calls.listCustomers).toHaveLength(0)
  })

  it('customer detail leaves the balance out for a role without invoice:read, and includes it with it', async () => {
    const operator = await json(
      await call(customerOne, 'token-operator', { params: { id: 'c0' }, path: '/api/v1/customers/c0' }),
    )

    expect(operator.data.account).toBeNull()
    expect(calls.customerAccount).toBe(0)

    const accountant = await json(
      await call(customerOne, 'token-accountant', { params: { id: 'c0' }, path: '/api/v1/customers/c0' }),
    )

    expect(accountant.data.account.outstanding).toBe('1500.50')
    expect(accountant.data.account.openInvoices[0]).toMatchObject({ due: '1500.50', dueDate: '2026-01-31' })
  })

  it('calendar: layers follow the role, and asking for one it lacks is 403', async () => {
    const operator = await json(
      await call(calendar, 'token-operator', { path: '/api/v1/calendar?from=2026-11-01&to=2026-12-01' }),
    )

    expect(operator.data.layers).toEqual(['orders'])

    const denied = await call(calendar, 'token-operator', {
      path: '/api/v1/calendar?from=2026-11-01&to=2026-12-01&layers=payments',
    })

    expect(denied.status).toBe(403)

    const admin = await json(
      await call(calendar, 'token-admin', { path: '/api/v1/calendar?from=2026-11-01&to=2026-12-01' }),
    )

    expect(admin.data.layers).toEqual(['orders', 'deliveries', 'invoices', 'payments'])
  })

  it('calendar: rejects a reversed, an unknown-layer and an over-long range with 422', async () => {
    for (const query of [
      'from=2026-11-10&to=2026-11-01',
      'from=2026-01-01&to=2026-12-31',
      'from=2026-11-01&to=2026-11-10&layers=nope',
      'from=bad&to=2026-11-10',
    ]) {
      const res = await call(calendar, 'token-admin', { path: `/api/v1/calendar?${query}` })

      expect(res.status, query).toBe(422)
    }
  })
})

describe('read endpoints: tenancy', () => {
  it("404 for another company's record id", async () => {
    const res = await call(customerOne, 'token-admin', { params: { id: 'other' }, path: '/api/v1/customers/other' })

    expect(res.status).toBe(404)
  })

  it('the other company sees it, and only its own in lists', async () => {
    const own = await call(customerOne, 'token-b', { company: 'cB', params: { id: 'other' } })

    expect(own.status).toBe(200)

    const list = await json(await call(customersList, 'token-b', { company: 'cB', path: '/api/v1/customers' }))

    expect(list.data.map((c: { id: string }) => c.id)).toEqual(['other'])
  })

  it('403 COMPANY_NOT_ACCESSIBLE for a company the person is not in', async () => {
    const res = await call(customersList, 'token-admin', { company: 'cB', path: '/api/v1/customers' })

    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('COMPANY_NOT_ACCESSIBLE')
  })

  it('400 COMPANY_REQUIRED without the header', async () => {
    const res = await call(customersList, 'token-admin', { company: null, path: '/api/v1/customers' })

    expect(res.status).toBe(400)
  })
})

describe('read endpoints: pagination', () => {
  it('walks every row exactly once through the cursor, in a stable order', async () => {
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0

    do {
      const path: string = `/api/v1/customers?limit=3${cursor ? `&cursor=${cursor}` : ''}`
      const res: Body = await json(await call(customersList, 'token-admin', { path }))

      seen.push(...res.data.map((c: { id: string }) => c.id))
      expect(res.meta).toBeDefined()
      expect(res.meta!.hasMore).toBe(res.meta!.nextCursor !== null)
      cursor = res.meta!.nextCursor
      pages += 1
    } while (cursor && pages < 10)

    expect(pages).toBe(3)
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  it('asks the query for limit + 1 rows, default 25, and refuses a limit above 100', async () => {
    await call(customersList, 'token-admin', { path: '/api/v1/customers' })
    await call(customersList, 'token-admin', { path: '/api/v1/customers?limit=100' })

    expect(calls.listCustomers).toMatchObject([{ take: 26 }, { take: 101 }])

    const res = await call(customersList, 'token-admin', { path: '/api/v1/customers?limit=101' })

    expect(res.status).toBe(422)
  })

  it('422 for a cursor that is not one', async () => {
    const res = await call(customersList, 'token-admin', { path: '/api/v1/customers?cursor=garbage' })

    expect(res.status).toBe(422)
  })

  it('the last page has no next cursor', async () => {
    const res = await json(await call(customersList, 'token-admin', { path: '/api/v1/customers?limit=100' }))

    expect(res.meta).toEqual({ nextCursor: null, hasMore: false })
  })
})

describe('read endpoints: shapes', () => {
  it('detail has an ETag and answers 304 to a matching If-None-Match', async () => {
    const first = await call(customerOne, 'token-admin', { params: { id: 'c0' }, path: '/api/v1/customers/c0' })
    const etag = first.headers.get('etag')

    expect(etag).toBeTruthy()
    expect((await json(first)).data.updatedAt).toBe('2026-01-10T00:00:00.000Z')

    const again = await call(customerOne, 'token-admin', {
      params: { id: 'c0' },
      path: '/api/v1/customers/c0',
      headers: { 'if-none-match': etag! },
    })

    expect(again.status).toBe(304)
  })

  it('dashboard: money as decimal strings and INR, blocks follow capabilities', async () => {
    const admin = await json(await call(dashboard, 'token-admin', { path: '/api/v1/dashboard/summary' }))

    expect(admin.data).toMatchObject({
      currency: 'INR',
      receivables: { outstanding: '900.10', overdue: '200.00', totalDue: '1000.00' },
      billedThisMonth: { total: '12345.50', count: 3 },
      paymentsReceivedThisMonth: { total: '5000.50', count: 2 },
      orders: { open: 5, overdue: 1, dueSoon: 2, readyToDispatch: 3 },
      lowStockCount: 4,
      payablesTotal: '77.00',
    })
    expect(admin.data.bookings.today[0]).toMatchObject({ number: 'ORD-1', dueDate: '2026-11-16' })

    const operator = await json(await call(dashboard, 'token-operator', { path: '/api/v1/dashboard/summary' }))

    expect(operator.data.receivables).toBeNull()
    expect(operator.data.billedThisMonth).toBeNull()
    expect(operator.data.payablesTotal).toBeNull()
    expect(operator.data.orders.open).toBe(5)
    expect(operator.data.lowStockCount).toBe(4)
  })

  it('payment methods carry a renderable field schema (regex as source text)', async () => {
    const res = await json(await call(methods, 'token-admin', { path: '/api/v1/payment-methods' }))
    const upi = res.data[0]

    expect(upi).toMatchObject({ id: 'm1', name: 'PhonePe', kind: 'UPI' })
    expect(upi.fields.length).toBeGreaterThan(0)
    expect(typeof upi.fields.find((f: { pattern?: string }) => f.pattern)?.pattern).toBe('string')
  })

  it('states is public, cached and answers 304', async () => {
    const first = await states(new Request('http://localhost/api/v1/states'), NO_PARAMS)

    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toContain('max-age=86400')
    expect((await first.json()).data.some((s: { name: string }) => s.name === 'Gujarat')).toBe(true)

    const again = await states(
      new Request('http://localhost/api/v1/states', { headers: { 'if-none-match': first.headers.get('etag')! } }),
      NO_PARAMS,
    )

    expect(again.status).toBe(304)
    expect(again.headers.get('cache-control')).toContain('max-age=86400')
  })

  it('production tasks and expense categories answer for a role with the capability', async () => {
    expect((await call(productionTasks, 'token-operator', { path: '/api/v1/production/tasks' })).status).toBe(200)

    const cats = await json(await call(expenseCategories, 'token-accountant', { path: '/api/v1/expense-categories' }))

    expect(cats.data).toEqual([{ id: 'k1', name: 'Fuel', sortOrder: 1 }])
    expect((await call(expenseCategories, 'token-operator', { path: '/api/v1/expense-categories' })).status).toBe(403)
  })
})
