import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore, setRateLimitStore } from '@/lib/api/rate-limit'
import { quotationInputSchema } from '@/lib/validation/quotations'

// DB-free: the session, memberships and the services are faked, so these check
// what the write routes add: the capability, the body validation (422 with
// fields), the mapping of a service refusal to the error envelope, a record of
// another company being 404, and idempotent replay. The services' own rules and
// the company scoping are exercised against a real database (see docs/mobile-api.md).

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
    deviceToken: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: 'd1', ...create }),
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => ({ count: where.id === 'mine' ? 1 : 0 }),
    },
    upload: { create: async () => ({ id: 'up1', mime: 'image/png', size: 8, purpose: 'expense_receipt' }) },
  },
}))

vi.mock('@/lib/api/idempotency-store', async () => {
  const { MemoryIdempotencyStore: Store } = await import('@/lib/api/idempotency')

  return { prismaIdempotencyStore: new Store() }
})

vi.mock('@/lib/storage', async (original) => ({
  ...(await original<typeof import('@/lib/storage')>()),
  isStorageConfigured: () => true,
  saveUpload: async () => ({ storedName: 'x.png', checksum: 'c' }),
}))

// ---- fake services: a record of company B ("cB-...") is invisible to company A.

const calls = vi.hoisted(() => ({ list: [] as { name: string; args: unknown[] }[] }))

const fake = vi.hoisted(
  () =>
    (name: string, extra: Record<string, unknown> = {}) =>
    async (...args: unknown[]) => {
      calls.list.push({ name, args })

      if (args.some((arg) => typeof arg === 'string' && arg.startsWith('cB-'))) {
        return { ok: false, error: 'Record not found' }
      }

      return { ok: true, message: 'Done', id: 'new1', number: 'N-1', ...extra }
    },
)

vi.mock('@/lib/services/customers', () => ({
  createCustomerUnique: fake('createCustomerUnique'),
  updateCustomer: fake('updateCustomer'),
}))
vi.mock('@/lib/services/quotations', () => ({
  createQuotation: fake('createQuotation'),
  updateQuotation: fake('updateQuotation'),
  setQuotationStatus: fake('setQuotationStatus'),
  createShareLink: fake('createShareLink', {
    url: 'https://x/q/t',
    token: 't',
    whatsappText: 'hi',
    whatsappLink: 'https://wa.me/?text=hi',
    created: true,
  }),
}))
vi.mock('@/lib/services/orders', () => ({
  createOrder: fake('createOrder'),
  updateOrder: fake('updateOrder'),
  setOrderStatus: fake('setOrderStatus'),
  convertQuotationToOrder: fake('convertQuotationToOrder'),
}))
vi.mock('@/lib/services/invoices', () => ({
  createInvoice: fake('createInvoice'),
  createInvoiceFromOrder: fake('createInvoiceFromOrder'),
  updateInvoice: fake('updateInvoice'),
  changeInvoiceStatus: fake('changeInvoiceStatus'),
  ensureInvoiceShareLink: fake('ensureInvoiceShareLink', { token: 'tok' }),
  suggestInterState: async () => false,
}))
vi.mock('@/lib/services/payments', () => ({
  createReceipt: fake('createReceipt'),
  deleteReceipt: fake('deleteReceipt'),
}))
vi.mock('@/lib/services/expenses', () => ({
  createExpense: fake('createExpense'),
  updateExpense: fake('updateExpense'),
  deleteExpense: fake('deleteExpense'),
}))
vi.mock('@/lib/services/production', () => ({
  startTask: fake('startTask'),
  completeTask: fake('completeTask'),
  holdTask: fake('holdTask'),
  skipTask: fake('skipTask'),
  reopenTask: fake('reopenTask'),
  assignTask: fake('assignTask'),
  saveTaskNotes: fake('saveTaskNotes'),
}))

// The read side: what a write answers with, and the lookups some routes do first.
vi.mock('@/lib/api/reads/detail', () => ({
  customerDetailFor: async (_u: unknown, id: string) => ({ id, kind: 'customer' }),
  quotationDetailFor: async (id: string) => ({ id, kind: 'quotation' }),
  orderDetailFor: async (id: string) => ({ id, kind: 'order' }),
  invoiceDetailFor: async (id: string) => ({ id, kind: 'invoice' }),
  paymentDetailFor: async (id: string) => ({ id, kind: 'payment' }),
  expenseDetailFor: async (id: string) => ({ id, kind: 'expense' }),
  productionTaskFor: async (id: string) => ({ id, kind: 'task' }),
}))

const company = (id: string) => (id.startsWith('cB-') ? null : { id })

vi.mock('@/lib/queries/customers', () => ({
  getCustomer: async (id: string) =>
    company(id)
      ? { id, name: 'Asha', type: 'INDIVIDUAL', status: 'ACTIVE', phone: '9876543210', state: 'Gujarat', openingDue: { toNumber: () => 0 } }
      : null,
}))
vi.mock('@/lib/queries/quotations', async (original) => ({
  ...(await original<typeof import('@/lib/queries/quotations')>()),
  getQuotation: async (id: string) => (company(id) ? { id, status: id === 'sent1' ? 'SENT' : 'DRAFT' } : null),
}))
vi.mock('@/lib/queries/invoices', async (original) => ({
  ...(await original<typeof import('@/lib/queries/invoices')>()),
  getInvoice: async (id: string) =>
    company(id)
      ? { id, number: 'INV-1', due: 100, total: 100, customer: { name: 'C', phone: '9999999999' } }
      : null,
}))
vi.mock('@/lib/queries/company', async (original) => ({
  ...(await original<typeof import('@/lib/queries/company')>()),
  getCompanySetting: async () => ({ companyName: 'Acme' }),
}))

// ---- the table of endpoints --------------------------------------------------

const lines = [
  { description: 'Wall panel', unit: 'SQFT', quantity: 10, rate: 250, taxRatePercent: 18 },
  { description: 'Fitting', unit: 'NOS', quantity: 2, rate: 1500, discountPercent: 10 },
]

const quotation = { customerId: 'cust1', subject: 'Kitchen', discountType: 'PERCENT', discountValue: 5, notes: 'n', lines }
const order = { customerId: 'cust1', orderDate: '2026-11-15', lines }
const invoice = { customerId: 'cust1', invoiceDate: '2026-11-15', lines: [{ description: 'Board', unit: 'SQFT', quantity: 1, rate: 100 }] }
const receipt = { customerId: 'cust1', amount: 500, methodId: 'm1', paidOn: '2026-11-15' }
const expense = { payeeName: 'Fuel Co', expenseDate: '2026-11-15', amount: 300, methodId: 'm1' }

type Endpoint = {
  name: string
  file: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  capability: string
  body?: unknown
  /** A body that fails validation, with the field expected in `fields`. */
  invalid?: { body: unknown; field: string }
  idempotent: boolean
  status: number
}

const E: Endpoint[] = [
  { name: 'POST /customers', file: 'customers/route', method: 'POST', path: '/customers', capability: 'customer:create', body: { name: 'Asha', phone: '9876543210', city: 'Surat' }, invalid: { body: { name: '', phone: '1' }, field: 'name' }, idempotent: true, status: 201 },
  { name: 'PATCH /customers/{id}', file: 'customers/[id]/route', method: 'PATCH', path: '/customers/cust1', capability: 'customer:update', body: { city: 'Vapi' }, invalid: { body: { email: 'nope' }, field: 'email' }, idempotent: false, status: 200 },
  { name: 'POST /quotations', file: 'quotations/route', method: 'POST', path: '/quotations', capability: 'quotation:create', body: quotation, invalid: { body: { ...quotation, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /quotations/{id}', file: 'quotations/[id]/route', method: 'PATCH', path: '/quotations/q1', capability: 'quotation:update', body: quotation, invalid: { body: { ...quotation, customerId: '' }, field: 'customerId' }, idempotent: false, status: 200 },
  { name: 'POST /quotations/{id}/status', file: 'quotations/[id]/status/route', method: 'POST', path: '/quotations/q1/status', capability: 'quotation:update', body: { status: 'SENT' }, invalid: { body: { status: 'NOPE' }, field: 'status' }, idempotent: true, status: 200 },
  { name: 'POST /quotations/{id}/share', file: 'quotations/[id]/share/route', method: 'POST', path: '/quotations/q1/share', capability: 'quotation:update', idempotent: true, status: 200 },
  { name: 'POST /quotations/{id}/convert', file: 'quotations/[id]/convert/route', method: 'POST', path: '/quotations/q1/convert', capability: 'order:create', idempotent: true, status: 201 },
  { name: 'POST /orders', file: 'orders/route', method: 'POST', path: '/orders', capability: 'order:create', body: order, invalid: { body: { ...order, orderDate: 'tomorrow' }, field: 'orderDate' }, idempotent: true, status: 201 },
  { name: 'PATCH /orders/{id}', file: 'orders/[id]/route', method: 'PATCH', path: '/orders/o1', capability: 'order:update', body: order, invalid: { body: { ...order, lines: [] }, field: 'lines' }, idempotent: false, status: 200 },
  { name: 'POST /orders/{id}/status', file: 'orders/[id]/status/route', method: 'POST', path: '/orders/o1/status', capability: 'order:update', body: { status: 'CONFIRMED' }, invalid: { body: {}, field: 'status' }, idempotent: true, status: 200 },
  { name: 'POST /invoices', file: 'invoices/route', method: 'POST', path: '/invoices', capability: 'invoice:create', body: invoice, invalid: { body: { ...invoice, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /invoices/{id}', file: 'invoices/[id]/route', method: 'PATCH', path: '/invoices/i1', capability: 'invoice:update', body: invoice, invalid: { body: { ...invoice, invoiceDate: '' }, field: 'invoiceDate' }, idempotent: false, status: 200 },
  { name: 'POST /invoices/{id}/issue', file: 'invoices/[id]/issue/route', method: 'POST', path: '/invoices/i1/issue', capability: 'invoice:update', idempotent: true, status: 200 },
  { name: 'POST /invoices/{id}/cancel', file: 'invoices/[id]/cancel/route', method: 'POST', path: '/invoices/i1/cancel', capability: 'invoice:update', idempotent: true, status: 200 },
  { name: 'POST /invoices/{id}/share', file: 'invoices/[id]/share/route', method: 'POST', path: '/invoices/i1/share', capability: 'invoice:update', idempotent: true, status: 200 },
  { name: 'POST /payments', file: 'payments/route', method: 'POST', path: '/payments', capability: 'payment:create', body: receipt, invalid: { body: { ...receipt, amount: 0 }, field: 'amount' }, idempotent: true, status: 201 },
  { name: 'DELETE /payments/{id}', file: 'payments/[id]/route', method: 'DELETE', path: '/payments/p1', capability: 'payment:delete', idempotent: false, status: 200 },
  { name: 'POST /expenses', file: 'expenses/route', method: 'POST', path: '/expenses', capability: 'expense:create', body: expense, invalid: { body: { ...expense, amount: -1 }, field: 'amount' }, idempotent: true, status: 201 },
  { name: 'PATCH /expenses/{id}', file: 'expenses/[id]/route', method: 'PATCH', path: '/expenses/e1', capability: 'expense:update', body: expense, invalid: { body: { ...expense, payeeName: '' }, field: 'payeeName' }, idempotent: false, status: 200 },
  { name: 'DELETE /expenses/{id}', file: 'expenses/[id]/route', method: 'DELETE', path: '/expenses/e1', capability: 'expense:delete', idempotent: false, status: 200 },
  { name: 'POST /production/tasks/{id}/start', file: 'production/tasks/[id]/start/route', method: 'POST', path: '/production/tasks/t1/start', capability: 'production:update', body: {}, invalid: { body: { force: 'yes' }, field: 'force' }, idempotent: true, status: 200 },
  { name: 'POST /production/tasks/{id}/complete', file: 'production/tasks/[id]/complete/route', method: 'POST', path: '/production/tasks/t1/complete', capability: 'production:update', body: { startNext: false }, invalid: { body: { startNext: 'no' }, field: 'startNext' }, idempotent: true, status: 200 },
  { name: 'POST /production/tasks/{id}/hold', file: 'production/tasks/[id]/hold/route', method: 'POST', path: '/production/tasks/t1/hold', capability: 'production:update', body: { reason: 'waiting' }, invalid: { body: { reason: 5 }, field: 'reason' }, idempotent: true, status: 200 },
  { name: 'POST /production/tasks/{id}/skip', file: 'production/tasks/[id]/skip/route', method: 'POST', path: '/production/tasks/t1/skip', capability: 'production:update', body: {}, invalid: { body: { reason: 5 }, field: 'reason' }, idempotent: true, status: 200 },
  { name: 'POST /production/tasks/{id}/reopen', file: 'production/tasks/[id]/reopen/route', method: 'POST', path: '/production/tasks/t1/reopen', capability: 'production:update', idempotent: true, status: 200 },
  { name: 'POST /production/tasks/{id}/assign', file: 'production/tasks/[id]/assign/route', method: 'POST', path: '/production/tasks/t1/assign', capability: 'production:update', body: { userId: 'u9' }, invalid: { body: {}, field: 'userId' }, idempotent: true, status: 200 },
  { name: 'PATCH /production/tasks/{id}/notes', file: 'production/tasks/[id]/notes/route', method: 'PATCH', path: '/production/tasks/t1/notes', capability: 'production:update', body: { notes: 'sanded' }, invalid: { body: {}, field: 'notes' }, idempotent: false, status: 200 },
]

const url = (path: string) => `http://x/api/v1${path}`

const routes = import.meta.glob('../../app/api/v1/**/route.ts') as Record<string, () => Promise<Record<string, (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>>>>

const call = async (endpoint: Endpoint, init: { token?: string; company?: string; path?: string; body?: unknown; key?: string } = {}) => {
  const route = await routes[`../../app/api/v1/${endpoint.file}.ts`]()
  const path = init.path ?? endpoint.path
  const body = 'body' in init ? init.body : endpoint.body
  const headers: Record<string, string> = {
    authorization: `Bearer ${init.token ?? 'token-admin'}`,
    'x-company-id': init.company ?? 'cA',
    'content-type': 'application/json',
  }

  if (init.key) headers['idempotency-key'] = init.key

  const request = new Request(url(path), {
    method: endpoint.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const id = path.split('/').filter(Boolean)
  const params: Record<string, string> = {}

  // /resource/{id}/... : the second segment is the id (production: the third).
  if (id[0] === 'production') params.id = id[2]
  else if (id[1]) params.id = id[1]

  const response = await route[endpoint.method](request, { params: Promise.resolve(params) })

  return { response, json: (await response.json()) as { data?: Record<string, unknown>; error?: { code: string; fields?: Record<string, string> } } }
}

beforeEach(() => {
  calls.list.length = 0
  setRateLimitStore(new MemoryRateLimitStore())
})

describe.each(E)('$name', (endpoint) => {
  it('is refused with 403 for a role without the capability', async () => {
    const { response, json } = await call(endpoint, { token: 'token-viewer' })

    expect(response.status).toBe(403)
    expect(json.error?.code).toBe('FORBIDDEN')
    expect(calls.list).toEqual([])
  })

  it('answers the saved resource with an ETag and runs the service once', async () => {
    const { response, json } = await call(endpoint)

    expect(response.status).toBe(endpoint.status)

    if (endpoint.method === 'DELETE') {
      expect(json.data).toMatchObject({ deleted: true })
    } else {
      expect(json.data).toBeTruthy()

      // A share link is a derived answer, not a record: no ETag.
      if (!endpoint.path.endsWith('/share')) expect(response.headers.get('etag')).toMatch(/^"/)
    }

    expect(calls.list.length).toBeGreaterThan(0)
  })

  if (endpoint.path.match(/\/(q1|o1|i1|p1|e1|t1|cust1)/)) {
    it("is 404 for another company's record", async () => {
      const path = endpoint.path.replace(/\/(q1|o1|i1|p1|e1|t1|cust1)/, '/cB-1')
      const { response, json } = await call(endpoint, { path })

      expect(response.status).toBe(404)
      expect(json.error?.code).toBe('NOT_FOUND')
    })
  }

  if (endpoint.invalid) {
    it('is 422 with the field named for an invalid body', async () => {
      const { response, json } = await call(endpoint, { body: endpoint.invalid!.body })

      expect(response.status).toBe(422)
      expect(json.error?.code).toBe('VALIDATION_FAILED')
      expect(Object.keys(json.error?.fields ?? {}).some((field) => field.startsWith(endpoint.invalid!.field))).toBe(true)
      expect(calls.list).toEqual([])
    })
  }

  if (endpoint.idempotent) {
    it('replays the first response for the same Idempotency-Key without running again', async () => {
      const key = `key-${endpoint.name.replace(/\W/g, '')}-${Math.random().toString(36).slice(2)}`
      const first = await call(endpoint, { key })
      const runs = calls.list.length
      const second = await call(endpoint, { key })

      expect(first.response.headers.get('Idempotent-Replayed')).toBeNull()
      expect(second.response.headers.get('Idempotent-Replayed')).toBe('true')
      expect(second.response.status).toBe(first.response.status)
      expect(second.json).toEqual(first.json)
      expect(calls.list.length).toBe(runs)
    })
  }
})

describe('service refusals', () => {
  it('map a rule that is not a lookup to 409 CONFLICT', async () => {
    const route = await import('@/app/api/v1/quotations/[id]/route')
    const request = new Request(url('/quotations/sent1'), {
      method: 'PATCH',
      headers: { authorization: 'Bearer token-admin', 'x-company-id': 'cA' },
      body: JSON.stringify(quotation),
    })
    const response = await route.PATCH(request, { params: Promise.resolve({ id: 'sent1' }) })

    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('CONFLICT')
  })
})

describe('money rules are the web ones', () => {
  it('hands the quotation service exactly what the web schema makes of the same JSON', async () => {
    const endpoint = E.find((e) => e.name === 'POST /quotations')!

    await call(endpoint, { body: { ...quotation, quotationDate: '2026-11-15' } })

    const sent = calls.list.find((c) => c.name === 'createQuotation')!.args[1] as { lines: unknown[]; status: string }
    const web = quotationInputSchema.parse({ ...quotation, quotationDate: '2026-11-15', status: 'DRAFT' })

    expect(sent).toEqual(web)
    expect(sent.status).toBe('DRAFT')
    expect(sent.lines).toHaveLength(2)
  })

  it('never lets a quotation body choose its own status', async () => {
    const endpoint = E.find((e) => e.name === 'POST /quotations')!

    await call(endpoint, { body: { ...quotation, status: 'ACCEPTED' } })

    expect((calls.list.find((c) => c.name === 'createQuotation')!.args[1] as { status: string }).status).toBe('DRAFT')
  })

  it('passes a receipt with allocations through untouched, naming the payment method as the channel', async () => {
    const endpoint = E.find((e) => e.name === 'POST /payments')!

    await call(endpoint, { body: { ...receipt, allocations: [{ invoiceId: 'i1', amount: 200 }], openingApplied: 50, details: { utr: '1' } } })

    expect(calls.list.find((c) => c.name === 'createReceipt')!.args[1]).toMatchObject({
      customerId: 'cust1',
      amount: 500,
      channelId: 'm1',
      allocations: [{ invoiceId: 'i1', amount: 200 }],
      openingApplied: 50,
      paymentDetails: { utr: '1' },
    })
  })

  it('creates an invoice from an order when only orderId is sent', async () => {
    const endpoint = E.find((e) => e.name === 'POST /invoices')!

    await call(endpoint, { body: { orderId: 'o1' } })

    expect(calls.list.map((c) => c.name)).toEqual(['createInvoiceFromOrder'])
  })

  it('issues through the status service (which holds the plan guard)', async () => {
    const endpoint = E.find((e) => e.name === 'POST /invoices/{id}/issue')!

    await call(endpoint)

    expect(calls.list.find((c) => c.name === 'changeInvoiceStatus')!.args.slice(1)).toEqual(['i1', 'ISSUED'])
  })
})

describe('a plan limit', () => {
  it('is 402 PLAN_LIMIT_REACHED', async () => {
    const { DomainError } = await import('@/lib/api/errors')
    const invoices = await import('@/lib/services/invoices')
    const route = await import('@/app/api/v1/invoices/[id]/issue/route')

    vi.spyOn(invoices, 'changeInvoiceStatus').mockRejectedValueOnce(new DomainError('Used up', 'PLAN_LIMIT_REACHED'))

    const response = await route.POST(
      new Request(url('/invoices/i1/issue'), { method: 'POST', headers: { authorization: 'Bearer token-admin', 'x-company-id': 'cA' } }),
      { params: Promise.resolve({ id: 'i1' }) },
    )

    expect(response.status).toBe(402)
    expect((await response.json()).error.code).toBe('PLAN_LIMIT_REACHED')
  })
})

describe('share links', () => {
  it('answer url, token, whatsappText and whatsappLink for a quotation and an invoice', async () => {
    for (const name of ['POST /quotations/{id}/share', 'POST /invoices/{id}/share']) {
      const { response, json } = await call(E.find((e) => e.name === name)!)

      expect(response.status).toBe(200)
      expect(Object.keys(json.data ?? {})).toEqual(expect.arrayContaining(['url', 'token', 'whatsappText', 'whatsappLink']))
      expect(String(json.data?.whatsappLink)).toContain('https://wa.me/')
    }
  })
})

describe('devices', () => {
  const token = 'ExponentPushToken[abcdefghijklmnop]'

  const device = async (method: 'POST' | 'DELETE', init: { body?: unknown; id?: string; token?: string } = {}) => {
    const route = await import(method === 'POST' ? '@/app/api/v1/devices/route' : '@/app/api/v1/devices/[id]/route')
    const request = new Request(url('/devices'), {
      method,
      headers: { authorization: `Bearer ${init.token ?? 'token-admin'}`, 'x-company-id': 'cA', 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const response = await route[method](request, { params: Promise.resolve({ id: init.id ?? '' }) })

    return { response, json: await response.json() }
  }

  it('registers a token, recording the active company', async () => {
    const { response, json } = await device('POST', { body: { expoPushToken: token, platform: 'ios' } })

    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({ expoPushToken: token, platform: 'ios', companyId: 'cA' })
  })

  it('is 422 for something that is not an Expo token', async () => {
    const { response, json } = await device('POST', { body: { expoPushToken: 'abc', platform: 'ios' } })

    expect(response.status).toBe(422)
    expect(json.error.fields.expoPushToken).toBeTruthy()
  })

  it('can remove only its own device', async () => {
    expect((await device('DELETE', { id: 'mine' })).response.status).toBe(200)
    expect((await device('DELETE', { id: 'theirs' })).response.status).toBe(404)
  })
})

describe('uploads', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  const upload = async (init: { token?: string; purpose?: string; file?: File | null }) => {
    const route = await import('@/app/api/v1/uploads/route')
    const form = new FormData()

    if (init.purpose !== undefined) form.set('purpose', init.purpose)
    if (init.file !== null) form.set('file', init.file ?? new File([png], 'bill.png', { type: 'image/png' }))

    const response = await route.POST(
      new Request(url('/uploads'), {
        method: 'POST',
        headers: { authorization: `Bearer ${init.token ?? 'token-admin'}`, 'x-company-id': 'cA' },
        body: form,
      }),
      { params: Promise.resolve({}) },
    )

    return { response, json: await response.json() }
  }

  it('stores an image and answers the upload id and url', async () => {
    const { response, json } = await upload({ purpose: 'expense_receipt' })

    expect(response.status).toBe(201)
    expect(json.data).toMatchObject({ uploadId: 'up1', url: '/api/v1/uploads/up1', purpose: 'expense_receipt' })
  })

  it('needs the capability the purpose is for', async () => {
    expect((await upload({ token: 'token-viewer', purpose: 'expense_receipt' })).response.status).toBe(403)
  })

  it('is 422 for an unknown purpose, a missing file, a type outside the allow-list and a fake image', async () => {
    expect((await upload({ purpose: 'selfie' })).json.error.fields.purpose).toBeTruthy()
    expect((await upload({ purpose: 'expense_receipt', file: null })).json.error.fields.file).toBeTruthy()
    expect(
      (await upload({ purpose: 'expense_receipt', file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }) })).json.error.fields.file,
    ).toBeTruthy()
    expect(
      (await upload({ purpose: 'expense_receipt', file: new File(['<html>'], 'a.png', { type: 'image/png' }) })).json.error.fields.file,
    ).toBeTruthy()
  })

  it('is 422 for a file over 10 MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    const { response, json } = await upload({ purpose: 'expense_receipt', file: big })

    expect(response.status).toBe(422)
    expect(json.error.fields.file).toBeTruthy()
  })
})

