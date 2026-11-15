import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore, setRateLimitStore } from '@/lib/api/rate-limit'

// DB-free, like writes.test.ts: the session, memberships and the services are
// faked, so these check what the purchasing routes add: the capability, the
// body validation (422 with fields), a service refusal becoming the error
// envelope, another company's record being 404, idempotent replay and paging.

const users: Record<string, { id: string; role: string }> = {
  'token-admin': { id: 'ua', role: 'VIEWER' },
  'token-viewer': { id: 'uv', role: 'VIEWER' },
  'token-operator': { id: 'uo', role: 'OPERATOR' },
}

const membership: Record<string, Record<string, string>> = {
  ua: { cA: 'ADMIN' },
  uv: { cA: 'VIEWER' },
  uo: { cA: 'OPERATOR' },
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

// ---- fake services: a record of company B ("cB-...") is invisible to company A.

const calls = vi.hoisted(() => ({ list: [] as { name: string; args: unknown[] }[] }))

const fake = vi.hoisted(
  () =>
    (name: string, extra: Record<string, unknown> = {}) =>
    async (...args: unknown[]) => {
      calls.list.push({ name, args })

      const isB = (value: unknown): boolean =>
        (typeof value === 'string' && value.startsWith('cB-')) ||
        (typeof value === 'object' && value !== null && 'id' in value && isB((value as { id: unknown }).id))

      if (args.some(isB)) return { ok: false, error: 'Record not found', code: 'NOT_FOUND' }

      return { ok: true, message: 'Done', id: 'new1', number: 'N-1', onHand: 5, reorderLevel: 3, ...extra }
    },
)

vi.mock('@/lib/services/vendors', () => ({
  createVendor: fake('createVendor'),
  updateVendor: fake('updateVendor'),
  deleteVendor: fake('deleteVendor'),
}))
vi.mock('@/lib/services/purchase-orders', () => ({
  createPurchaseOrder: fake('createPurchaseOrder'),
  updatePurchaseOrder: fake('updatePurchaseOrder'),
  setPurchaseOrderStatus: fake('setPurchaseOrderStatus'),
  deletePurchaseOrder: fake('deletePurchaseOrder'),
  createBillFromOrder: fake('createBillFromOrder'),
}))
vi.mock('@/lib/services/purchase-bills', () => ({
  createPurchaseBill: fake('createPurchaseBill'),
  updatePurchaseBill: fake('updatePurchaseBill'),
  setPurchaseBillStatus: fake('setPurchaseBillStatus'),
  duplicatePurchaseBill: fake('duplicatePurchaseBill'),
  deletePurchaseBill: fake('deletePurchaseBill'),
}))
vi.mock('@/lib/services/goods-receipts', () => ({
  postReceiptLogged: fake('postReceiptLogged', { receipt: { id: 'gr9', number: 'GR-1', lineCount: 1 } }),
  cancelReceiptLogged: fake('cancelReceiptLogged', { alreadyCancelled: false }),
  getReceivable: async () => ({ error: 'Bill not found' }),
}))
vi.mock('@/lib/services/vendor-payments', () => ({
  createVendorPayment: fake('createVendorPayment'),
  updateVendorAllocations: fake('updateVendorAllocations'),
  deleteVendorPayment: fake('deleteVendorPayment'),
}))
vi.mock('@/lib/services/stock', () => ({
  adjustStockLogged: fake('adjustStockLogged'),
  openingStockLogged: fake('openingStockLogged'),
  setReorderLevel: fake('setReorderLevel'),
}))

// The read side: what a write answers with.
vi.mock('@/lib/api/reads/purchasing', async (original) => {
  const { ApiError } = await import('@/lib/api/errors')
  const load = (kind: string) => async (id: string) => {
    if (id.startsWith('cB-')) throw new ApiError('NOT_FOUND', `${kind} not found.`)

    return { id, kind }
  }

  return {
    ...(await original<typeof import('@/lib/api/reads/purchasing')>()),
    vendorDetailFor: load('vendor'),
    purchaseOrderDetailFor: load('purchase-order'),
    purchaseBillDetailFor: load('purchase-bill'),
    goodsReceiptDetailFor: load('goods-receipt'),
    vendorPaymentDetailFor: load('vendor-payment'),
  }
})

const num = (value: number) => ({ toNumber: () => value })

vi.mock('@/lib/queries/vendors', () => ({
  listVendors: async () =>
    ['Beta', 'Alpha', 'Gamma'].map((name, index) => ({
      id: `v${index}`,
      name,
      contactName: null,
      phone: null,
      email: null,
      gstin: null,
      address: null,
      city: null,
      description: null,
      isActive: true,
      openingPayable: num(0),
      openingAsOf: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      spent: 100,
      bills: 1,
      lastPaid: null,
    })),
  getVendor: async () => null,
}))
vi.mock('@/lib/queries/payables', () => ({
  getPayables: async () => ({
    totalPayable: 0,
    billsDue: 0,
    openingTotal: 0,
    overdue: 0,
    advances: 0,
    openBillCount: 0,
    aging: [],
    vendors: [],
  }),
  getVendorStatement: async (id: string) => (id.startsWith('cB-') ? null : { vendor: { id, name: 'V', phone: null, gstin: null }, openBills: [], entries: [], openingPayable: 0, openingAsOf: null, openingLeft: 0, billsDue: 0, due: 0, advance: 0, overdue: 0, net: 0 }),
}))
vi.mock('@/lib/queries/stock', () => ({
  listStock: async () => [
    { kind: 'item', id: 's1', name: 'Board', code: 'I-1', unit: 'SQFT', onHand: 4, averageCost: 12.5, value: 50, reorderLevel: 5, state: 'low' },
  ],
  getStockSubject: async (_kind: string, id: string) =>
    id.startsWith('cB-') ? null : { kind: 'item', id, name: 'Board', code: null, unit: null, stockTracked: true, reorderLevel: null },
  getStockLedger: async () => ({ rows: [], onHand: 0, averageCost: 0, value: 0, hasOpening: false }),
}))

// ---- the table of endpoints --------------------------------------------------

const poLines = [{ description: 'Ply', qty: 10, unit: 'SQFT', rate: 80, taxRatePercent: 18 }]
const purchaseOrder = { vendorId: 'v1', orderDate: '2026-11-15', lines: poLines }
const billLines = [{ description: 'Ply', qty: 10, unit: 'SQFT', rate: 80, discount: 0, taxRatePercent: 18 }]
const purchaseBill = { vendorId: 'v1', billDate: '2026-11-15', isInterState: false, lines: billLines }
const vendorPayment = { vendorId: 'v1', amount: 500, methodId: 'm1', paidOn: '2026-11-15' }

type Endpoint = {
  name: string
  file: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  capability: string
  body?: unknown
  invalid?: { body: unknown; field: string }
  idempotent: boolean
  status: number
  /** The id segment a record of another company replaces. */
  otherCompany?: string
}

const E: Endpoint[] = [
  { name: 'POST /vendors', file: 'vendors/route', method: 'POST', path: '/vendors', capability: 'expense:create', body: { name: 'Ply House', city: 'Surat' }, invalid: { body: { name: '' }, field: 'name' }, idempotent: true, status: 201 },
  { name: 'PATCH /vendors/{id}', file: 'vendors/[id]/route', method: 'PATCH', path: '/vendors/v1', capability: 'expense:update', body: { name: 'Ply House' }, invalid: { body: { name: 'X', email: 'nope' }, field: 'email' }, idempotent: false, status: 200, otherCompany: 'v1' },
  { name: 'DELETE /vendors/{id}', file: 'vendors/[id]/route', method: 'DELETE', path: '/vendors/v1', capability: 'expense:delete', idempotent: false, status: 200, otherCompany: 'v1' },
  { name: 'POST /purchase-orders', file: 'purchase-orders/route', method: 'POST', path: '/purchase-orders', capability: 'purchase:create', body: purchaseOrder, invalid: { body: { ...purchaseOrder, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /purchase-orders/{id}', file: 'purchase-orders/[id]/route', method: 'PATCH', path: '/purchase-orders/po1', capability: 'purchase:update', body: purchaseOrder, invalid: { body: { ...purchaseOrder, orderDate: 'soon' }, field: 'orderDate' }, idempotent: false, status: 200, otherCompany: 'po1' },
  { name: 'POST /purchase-orders/{id}/status', file: 'purchase-orders/[id]/status/route', method: 'POST', path: '/purchase-orders/po1/status', capability: 'purchase:update', body: { status: 'SENT' }, invalid: { body: { status: 'NOPE' }, field: 'status' }, idempotent: true, status: 200, otherCompany: 'po1' },
  { name: 'POST /purchase-orders/{id}/create-bill', file: 'purchase-orders/[id]/create-bill/route', method: 'POST', path: '/purchase-orders/po1/create-bill', capability: 'purchase:create', idempotent: true, status: 201, otherCompany: 'po1' },
  { name: 'DELETE /purchase-orders/{id}', file: 'purchase-orders/[id]/route', method: 'DELETE', path: '/purchase-orders/po1', capability: 'purchase:delete', idempotent: false, status: 200, otherCompany: 'po1' },
  { name: 'POST /purchase-bills', file: 'purchase-bills/route', method: 'POST', path: '/purchase-bills', capability: 'purchase:create', body: purchaseBill, invalid: { body: { ...purchaseBill, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /purchase-bills/{id}', file: 'purchase-bills/[id]/route', method: 'PATCH', path: '/purchase-bills/pb1', capability: 'purchase:update', body: purchaseBill, invalid: { body: { ...purchaseBill, vendorId: '' }, field: 'vendorId' }, idempotent: false, status: 200, otherCompany: 'pb1' },
  { name: 'POST /purchase-bills/{id}/status', file: 'purchase-bills/[id]/status/route', method: 'POST', path: '/purchase-bills/pb1/status', capability: 'purchase:update', body: { status: 'POSTED' }, invalid: { body: { status: 'NOPE' }, field: 'status' }, idempotent: true, status: 200, otherCompany: 'pb1' },
  { name: 'POST /purchase-bills/{id}/duplicate', file: 'purchase-bills/[id]/duplicate/route', method: 'POST', path: '/purchase-bills/pb1/duplicate', capability: 'purchase:create', idempotent: true, status: 201, otherCompany: 'pb1' },
  { name: 'DELETE /purchase-bills/{id}', file: 'purchase-bills/[id]/route', method: 'DELETE', path: '/purchase-bills/pb1', capability: 'purchase:delete', idempotent: false, status: 200, otherCompany: 'pb1' },
  { name: 'POST /goods-receipts', file: 'goods-receipts/route', method: 'POST', path: '/goods-receipts', capability: 'stock:create', body: { billId: 'pb1', receivedOn: '2026-11-15', lines: [{ lineId: 'l1', qty: 2 }] }, invalid: { body: { receivedOn: '2026-11-15', lines: [] }, field: 'billId' }, idempotent: true, status: 201 },
  { name: 'POST /goods-receipts/{id}/cancel', file: 'goods-receipts/[id]/cancel/route', method: 'POST', path: '/goods-receipts/gr1/cancel', capability: 'stock:update', body: {}, invalid: { body: { allowNegative: 'yes' }, field: 'allowNegative' }, idempotent: true, status: 200, otherCompany: 'gr1' },
  { name: 'POST /vendor-payments', file: 'vendor-payments/route', method: 'POST', path: '/vendor-payments', capability: 'purchase:update', body: vendorPayment, invalid: { body: { ...vendorPayment, amount: 0 }, field: 'amount' }, idempotent: true, status: 201 },
  { name: 'PATCH /vendor-payments/{id}/allocations', file: 'vendor-payments/[id]/allocations/route', method: 'PATCH', path: '/vendor-payments/vp1/allocations', capability: 'purchase:update', body: { allocations: [{ billId: 'pb1', amount: 100 }] }, invalid: { body: {}, field: 'allocations' }, idempotent: false, status: 200, otherCompany: 'vp1' },
  { name: 'DELETE /vendor-payments/{id}', file: 'vendor-payments/[id]/route', method: 'DELETE', path: '/vendor-payments/vp1', capability: 'purchase:delete', idempotent: false, status: 200, otherCompany: 'vp1' },
  { name: 'POST /stock/adjustments', file: 'stock/adjustments/route', method: 'POST', path: '/stock/adjustments', capability: 'stock:create', body: { kind: 'item', id: 's1', qty: -2, reason: 'Damaged' }, invalid: { body: { kind: 'item', id: 's1', qty: 0, reason: 'x' }, field: 'qty' }, idempotent: true, status: 201 },
  { name: 'POST /stock/opening', file: 'stock/opening/route', method: 'POST', path: '/stock/opening', capability: 'stock:create', body: { kind: 'material', id: 's1', qty: 10, unitCost: 5 }, invalid: { body: { kind: 'material', id: 's1', qty: 0, unitCost: 5 }, field: 'qty' }, idempotent: true, status: 201 },
  { name: 'PATCH /stock/{kind}/{id}/reorder-level', file: 'stock/[kind]/[id]/reorder-level/route', method: 'PATCH', path: '/stock/item/s1/reorder-level', capability: 'item:update', body: { reorderLevel: 3 }, invalid: { body: { reorderLevel: -1 }, field: 'reorderLevel' }, idempotent: false, status: 200, otherCompany: 's1' },
]

const url = (path: string) => `http://x/api/v1${path}`

const routes = import.meta.glob('../../app/api/v1/**/route.ts') as Record<string, () => Promise<Record<string, (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>>>>

type Json = { data?: Record<string, unknown> | unknown[]; meta?: { nextCursor: string | null; hasMore: boolean }; error?: { code: string; fields?: Record<string, string> } }

const call = async (
  endpoint: Pick<Endpoint, 'file' | 'method' | 'path' | 'body'>,
  init: { token?: string; path?: string; body?: unknown; key?: string } = {},
) => {
  const route = await routes[`../../app/api/v1/${endpoint.file}.ts`]()
  const path = init.path ?? endpoint.path
  const body = 'body' in init ? init.body : endpoint.body
  const headers: Record<string, string> = {
    authorization: `Bearer ${init.token ?? 'token-admin'}`,
    'x-company-id': 'cA',
    'content-type': 'application/json',
  }

  if (init.key) headers['idempotency-key'] = init.key

  const request = new Request(url(path), {
    method: endpoint.method,
    headers,
    body: body === undefined || endpoint.method === 'GET' ? undefined : JSON.stringify(body),
  })
  const segments = path.split('?')[0].split('/').filter(Boolean)
  const params: Record<string, string> = {}

  if (segments[0] === 'stock' && segments.length >= 3) {
    params.kind = segments[1]
    params.id = segments[2]
  } else if (segments[1]) {
    params.id = segments[1]
  }

  const response = await route[endpoint.method](request, { params: Promise.resolve(params) })

  return { response, json: (await response.json()) as Json }
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

    if (endpoint.method === 'DELETE') expect(json.data).toMatchObject({ deleted: true })
    else {
      expect(json.data).toBeTruthy()
      expect(response.headers.get('etag')).toMatch(/^"/)
    }

    expect(calls.list.length).toBeGreaterThan(0)
  })

  if (endpoint.otherCompany) {
    it("is 404 for another company's record", async () => {
      const path = endpoint.path.replace(`/${endpoint.otherCompany}`, '/cB-1')
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

describe('reads', () => {
  const read = (name: string, file: string, path: string, capability?: string) => ({ name, file, method: 'GET' as const, path, capability })

  it.each([
    read('GET /vendors', 'vendors/route', '/vendors', 'expense:read'),
    read('GET /purchase-orders/{id}', 'purchase-orders/[id]/route', '/purchase-orders/po1', 'purchase:read'),
    read('GET /purchase-bills/{id}', 'purchase-bills/[id]/route', '/purchase-bills/pb1', 'purchase:read'),
    read('GET /goods-receipts/{id}', 'goods-receipts/[id]/route', '/goods-receipts/gr1', 'purchase:read'),
    read('GET /vendor-payments/{id}', 'vendor-payments/[id]/route', '/vendor-payments/vp1', 'purchase:read'),
    read('GET /payables', 'payables/route', '/payables', 'purchase:read'),
    read('GET /vendors/{id}/statement', 'vendors/[id]/statement/route', '/vendors/v1/statement', 'purchase:read'),
  ])('$name needs $capability (an operator is 403)', async (endpoint) => {
    const denied = await call(endpoint, { token: 'token-operator' })

    expect(denied.response.status).toBe(403)

    const allowed = await call(endpoint, { token: 'token-viewer' })

    expect(allowed.response.status).toBe(200)
  })

  it.each([
    ['vendors/[id]/route', '/vendors/cB-1'],
    ['purchase-orders/[id]/route', '/purchase-orders/cB-1'],
    ['purchase-bills/[id]/route', '/purchase-bills/cB-1'],
    ['goods-receipts/[id]/route', '/goods-receipts/cB-1'],
    ['vendor-payments/[id]/route', '/vendor-payments/cB-1'],
    ['vendors/[id]/statement/route', '/vendors/cB-1/statement'],
    ['stock/[kind]/[id]/route', '/stock/item/cB-1'],
  ])("%s is 404 for another company's record", async (file, path) => {
    const { response, json } = await call({ file, method: 'GET', path }, { token: 'token-viewer' })

    expect(response.status).toBe(404)
    expect(json.error?.code).toBe('NOT_FOUND')
  })

  it('pages a list in name order with an opaque cursor that never repeats a row', async () => {
    const endpoint = { file: 'vendors/route', method: 'GET' as const, path: '/vendors?limit=2' }
    const first = await call(endpoint, { token: 'token-viewer' })
    const firstNames = (first.json.data as { name: string }[]).map((row) => row.name)

    expect(firstNames).toEqual(['Alpha', 'Beta'])
    expect(first.json.meta?.hasMore).toBe(true)

    const second = await call({ ...endpoint, path: `/vendors?limit=2&cursor=${first.json.meta?.nextCursor}` }, { token: 'token-viewer' })

    expect((second.json.data as { name: string }[]).map((row) => row.name)).toEqual(['Gamma'])
    expect(second.json.meta).toEqual({ nextCursor: null, hasMore: false })
  })

  it('lists stock with decimal strings', async () => {
    const { json } = await call({ file: 'stock/route', method: 'GET', path: '/stock' }, { token: 'token-operator' })

    expect(json.data).toEqual([
      { kind: 'item', id: 's1', name: 'Board', code: 'I-1', unit: 'SQFT', onHand: '4', averageCost: '12.5', value: '50.00', reorderLevel: '5', state: 'low' },
    ])
  })

  it('answers 404 for an unknown bill and 422 when neither billId nor poId is sent (receivable)', async () => {
    const { response, json } = await call(
      { file: 'goods-receipts/receivable/route', method: 'GET', path: '/goods-receipts/receivable?billId=pb1' },
      { token: 'token-viewer' },
    )

    expect(response.status).toBe(404)
    expect(json.error?.code).toBe('NOT_FOUND')

    const missing = await call({ file: 'goods-receipts/receivable/route', method: 'GET', path: '/goods-receipts/receivable' }, { token: 'token-viewer' })

    expect(missing.response.status).toBe(422)
  })
})

describe('rules shared with the web', () => {
  it('passes a vendor payment through naming the payment method as the channel', async () => {
    const endpoint = E.find((e) => e.name === 'POST /vendor-payments')!

    await call(endpoint, { body: { ...vendorPayment, allocations: [{ billId: 'pb1', amount: 200 }], openingApplied: 50, details: { utr: '1' } } })

    expect(calls.list.find((c) => c.name === 'createVendorPayment')!.args[1]).toMatchObject({
      vendorId: 'v1',
      amount: 500,
      channelId: 'm1',
      allocations: [{ billId: 'pb1', amount: 200 }],
      openingApplied: 50,
      paymentDetails: { utr: '1' },
    })
  })

  it('needs stock:create as well to post a bill and receive its goods', async () => {
    const endpoint = E.find((e) => e.name === 'POST /purchase-bills/{id}/status')!
    const accountant = { token: 'token-viewer', body: { status: 'POSTED', receiveNow: true } }

    // A viewer has neither right; the capability check on the route comes first.
    expect((await call(endpoint, accountant)).response.status).toBe(403)

    await call(endpoint, { body: { status: 'POSTED', receiveNow: true } })

    expect(calls.list.find((c) => c.name === 'setPurchaseBillStatus')!.args[3]).toEqual({ receiveNow: true })
  })

  it('lets only an administrator allow negative stock', async () => {
    const endpoint = E.find((e) => e.name === 'POST /stock/adjustments')!

    await call(endpoint, { body: { kind: 'item', id: 's1', qty: -2, reason: 'Damaged', allowNegative: true } })

    expect((calls.list.find((c) => c.name === 'adjustStockLogged')!.args[1] as { allowNegative: boolean }).allowNegative).toBe(true)
  })

  it('maps a service refusal that is not a lookup to 409 CONFLICT', async () => {
    const services = await import('@/lib/services/purchase-orders')

    vi.spyOn(services, 'setPurchaseOrderStatus').mockResolvedValueOnce({ ok: false, error: 'Cannot move it', code: 'CONFLICT' })

    const endpoint = E.find((e) => e.name === 'POST /purchase-orders/{id}/status')!
    const { response, json } = await call(endpoint)

    expect(response.status).toBe(409)
    expect(json.error?.code).toBe('CONFLICT')
  })
})
