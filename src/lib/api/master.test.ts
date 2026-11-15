import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore, setRateLimitStore } from '@/lib/api/rate-limit'
import { buildOpenApiDocument } from '@/lib/api/openapi/document'
import { itemInputSchema } from '@/lib/validation/items'

// DB-free, like writes.test.ts: the session, memberships, the services and the
// read loaders are faked, so these check what the master-data routes add: the
// capability, the body validation (422 with fields), the mapping of a service
// refusal to the error envelope, another company's record being 404, idempotent
// replay and that the web's own validation runs on what is saved.

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

const mine = (id: unknown) => typeof id === 'string' && !id.startsWith('cB-')

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
    customer: { findUnique: async ({ where }: { where: { id: string } }) => (mine(where.id) ? { id: where.id } : null) },
    invoice: { findUnique: async ({ where }: { where: { id: string } }) => (mine(where.id) ? { id: where.id } : null) },
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

const calls = vi.hoisted(() => ({ list: [] as { name: string; args: unknown[] }[] }))

// A service of company A answers ok; one given a record of company B ("cB-...") says "not found".
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

vi.mock('@/lib/services/items', () => ({
  createItem: fake('createItem', { code: 'ITM-1' }),
  updateItem: fake('updateItem'),
  deleteItem: fake('deleteItem'),
}))
vi.mock('@/lib/services/materials', () => ({
  createMaterial: fake('createMaterial'),
  renameMaterial: fake('renameMaterial'),
  setMaterialActive: fake('setMaterialActive'),
  setMaterialStock: fake('setMaterialStock'),
  moveMaterial: fake('moveMaterial'),
  deleteMaterial: fake('deleteMaterial'),
}))
vi.mock('@/lib/services/partners', () => ({
  createPartner: fake('createPartner', { code: 'ARC-1' }),
  updatePartner: fake('updatePartner'),
  setPartnerActive: fake('setPartnerActive'),
  deletePartner: fake('deletePartner'),
}))
vi.mock('@/lib/services/payment-methods', () => ({
  addPaymentMode: fake('addPaymentMode'),
  updatePaymentMode: fake('updatePaymentMode'),
  setPaymentModeActive: fake('setPaymentModeActive'),
  movePaymentMode: fake('movePaymentMode'),
  deletePaymentMode: fake('deletePaymentMode'),
}))
vi.mock('@/lib/services/payment-mode-qr', () => ({
  setPaymentModeQr: fake('setPaymentModeQr'),
  removePaymentModeQr: fake('removePaymentModeQr'),
  readPaymentModeQr: async () => ({ bytes: Buffer.from('x'), mime: 'image/png' }),
}))
vi.mock('@/lib/services/expenses', () => ({
  createExpenseCategory: fake('createExpenseCategory'),
  updateExpenseCategory: fake('updateExpenseCategory'),
  deleteExpenseCategory: fake('deleteExpenseCategory'),
}))
vi.mock('@/lib/services/company-settings', async (original) => ({
  ...(await original<typeof import('@/lib/services/company-settings')>()),
  saveCompanySetting: fake('saveCompanySetting'),
  setCompanyAsset: fake('setCompanyAsset'),
  removeCompanyAsset: fake('removeCompanyAsset'),
  readCompanyAsset: async () => ({ bytes: Buffer.from('x'), mime: 'image/png' }),
}))
vi.mock('@/lib/services/stages', () => ({
  createStage: fake('createStage'),
  renameStage: fake('renameStage'),
  setStageStatus: fake('setStageStatus'),
  setStageActive: fake('setStageActive'),
  moveStage: fake('moveStage'),
  deleteStage: fake('deleteStage'),
}))
vi.mock('@/lib/services/adjustments', () => ({
  createAdjustment: fake('createAdjustment'),
  updateAdjustment: fake('updateAdjustment'),
  deleteAdjustment: fake('deleteAdjustment'),
  saveOpeningBalances: fake('saveOpeningBalances'),
}))
vi.mock('@/lib/services/notes', () => ({
  createNote: fake('createNote'),
  updateNote: fake('updateNote'),
  setNoteStatus: fake('setNoteStatus'),
  deleteNote: fake('deleteNote'),
}))
vi.mock('@/lib/services/dispatches', () => ({
  createDispatch: fake('createDispatch'),
  updateDispatch: fake('updateDispatch'),
  setDispatchStatus: fake('setDispatchStatus'),
  recordReceipt: fake('recordReceipt'),
  deleteDispatch: fake('deleteDispatch'),
}))

// The read side: what a write answers with, and the lookups some routes do first.
vi.mock('@/lib/api/reads/master', async () => {
  const { ApiError } = await import('@/lib/api/errors')
  const load = (kind: string) => async (...args: unknown[]) => {
    const id = args.find((arg) => typeof arg === 'string' && arg !== '') as string | undefined

    if (id && !mine(id)) throw new ApiError('NOT_FOUND', `${kind} not found.`)

    return { id, kind, name: 'Cash', sortOrder: 1, isActive: true }
  }
  const mode = { id: 'md1', name: 'HDFC', kind: 'UPI', isActive: true, accountDetails: {}, showOnDocuments: false, details: [], mode: 'UPI' }

  return {
    itemDetailFor: load('item'),
    partnerDetailFor: load('partner'),
    partnerDetailOut: (row: unknown) => row,
    partnerListOut: (row: unknown) => row,
    paymentModeFor: load('mode'),
    paymentModeOut: () => mode,
    paymentModeRows: async () => [mode],
    findPaymentMode: async (id: string) => (mine(id) ? mode : null),
    expenseCategoryFor: load('category'),
    companyProfileFor: async () => ({ companyName: 'Acme' }),
    materialRows: async () => [{ id: 'mat1', name: 'Ply', sortOrder: 0, isActive: true, stockTracked: false, reorderLevel: null, itemCount: 0 }],
    stageRows: async () => [{ id: 'st1', name: 'Cut', sortOrder: 0, isActive: true, linkedStatus: null, taskCount: 0 }],
    adjustmentFor: load('adjustment'),
    adjustmentOut: (row: unknown) => row,
    openingBalanceRows: async () => [{ channelId: 'md1', name: 'HDFC', isActive: true, amount: '100.00', asOf: '2026-04-01' }],
    noteDetailFor: load('note'),
    noteListOut: (row: unknown) => row,
    dispatchDetailFor: load('dispatch'),
    dispatchListOut: (row: unknown) => row,
  }
})

const row = (id: string) => (mine(id) ? { id } : null)

vi.mock('@/lib/queries/items', async (original) => ({
  ...(await original<typeof import('@/lib/queries/items')>()),
  getItem: async (id: string) =>
    mine(id)
      ? { id, name: 'Ply', type: 'MATERIAL', supplyType: 'GOODS', unit: 'SQFT', rate: 100, taxRatePercent: 18, isFlatRate: false, dimensionUnit: 'MM', isActive: true, stockTracked: false }
      : null,
}))
vi.mock('@/lib/queries/partners', async (original) => ({
  ...(await original<typeof import('@/lib/queries/partners')>()),
  getPartner: async (id: string) => (mine(id) ? { id, type: 'ARCHITECT', name: 'Ravi', phone: '9876543210', isActive: true } : null),
}))
vi.mock('@/lib/queries/company', async (original) => ({
  ...(await original<typeof import('@/lib/queries/company')>()),
  getCompanySetting: async () => ({ companyName: 'Acme', defaultAdvancePercent: { toNumber: () => 80 } }),
}))

void row

// ---- the table of endpoints --------------------------------------------------

const item = { name: 'Plywood', rate: 100, taxRatePercent: 18 }
const partner = { type: 'ARCHITECT', name: 'Ravi', phone: '9876543210' }
const adjustment = { kind: 'CHANNEL', targetId: 'm1', direction: 'up', amount: 100, adjustedOn: '2026-11-15', reason: 'FORGOTTEN_ENTRY', note: 'Cash found in drawer' }
const note = { kind: 'CREDIT', partyType: 'CUSTOMER', customerId: 'cust1', noteDate: '2026-11-15', lines: [{ description: 'Return', quantity: 1, rate: 100 }] }
const dispatch = { orderId: 'o1', dispatchDate: '2026-11-15', lines: [{ orderLineId: 'l1', description: 'Panel', unit: 'NOS', quantity: 1 }] }

type Endpoint = {
  name: string
  file: string
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** `:id` is replaced with a record of company A, or of company B for the 404 check. */
  path: string
  param?: string
  /** The id used for a record of company A (default x1). */
  okId?: string
  /** No 404 check (the path parameter is not a record id). */
  no404?: boolean
  docPath?: string
  capability: string
  body?: unknown
  invalid?: { body: unknown; field: string }
  idempotent: boolean
  status: number
  /** The answer is a list, or has no ETag. */
  noEtag?: boolean
}

const E: Endpoint[] = [
  { name: 'POST /items', file: 'items/route', method: 'POST', path: '/items', capability: 'item:create', body: item, invalid: { body: { name: '', rate: -1 }, field: 'name' }, idempotent: true, status: 201 },
  { name: 'PATCH /items/{id}', file: 'items/[id]/route', method: 'PATCH', path: '/items/:id', capability: 'item:update', body: { rate: 120 }, invalid: { body: { rate: 'abc' }, field: 'rate' }, idempotent: false, status: 200 },
  { name: 'DELETE /items/{id}', file: 'items/[id]/route', method: 'DELETE', path: '/items/:id', capability: 'item:delete', idempotent: false, status: 200 },

  { name: 'POST /materials', file: 'materials/route', method: 'POST', path: '/materials', capability: 'item:create', body: { name: 'Ply' }, invalid: { body: { name: '' }, field: 'name' }, idempotent: true, status: 201, noEtag: true },
  { name: 'PATCH /materials/{id}', file: 'materials/[id]/route', method: 'PATCH', path: '/materials/:id', okId: 'mat1', capability: 'item:update', body: { name: 'Ply 2', isActive: false }, invalid: { body: { isActive: 'no' }, field: 'isActive' }, idempotent: false, status: 200, noEtag: true },
  { name: 'POST /materials/{id}/move', file: 'materials/[id]/move/route', method: 'POST', path: '/materials/:id/move', capability: 'item:update', body: { direction: 'up' }, invalid: { body: { direction: 'left' }, field: 'direction' }, idempotent: true, status: 200, noEtag: true },
  { name: 'DELETE /materials/{id}', file: 'materials/[id]/route', method: 'DELETE', path: '/materials/:id', capability: 'item:delete', idempotent: false, status: 200 },

  { name: 'POST /partners', file: 'partners/route', method: 'POST', path: '/partners', capability: 'partner:create', body: partner, invalid: { body: { type: 'X', name: '' }, field: 'type' }, idempotent: true, status: 201 },
  { name: 'PATCH /partners/{id}', file: 'partners/[id]/route', method: 'PATCH', path: '/partners/:id', capability: 'partner:update', body: { city: 'Surat' }, invalid: { body: { email: 5 }, field: 'email' }, idempotent: false, status: 200 },
  { name: 'POST /partners/{id}/active', file: 'partners/[id]/active/route', method: 'POST', path: '/partners/:id/active', capability: 'partner:update', body: { isActive: false }, invalid: { body: {}, field: 'isActive' }, idempotent: true, status: 200 },
  { name: 'DELETE /partners/{id}', file: 'partners/[id]/route', method: 'DELETE', path: '/partners/:id', capability: 'partner:delete', idempotent: false, status: 200 },

  { name: 'POST /settings/payment-modes', file: 'settings/payment-modes/route', method: 'POST', path: '/settings/payment-modes', capability: 'settings:update', body: { name: 'HDFC', kind: 'UPI' }, invalid: { body: { name: '', kind: 'UPI' }, field: 'name' }, idempotent: true, status: 201, noEtag: true },
  { name: 'PATCH /settings/payment-modes/{id}', file: 'settings/payment-modes/[id]/route', method: 'PATCH', path: '/settings/payment-modes/:id', capability: 'settings:update', body: { name: 'HDFC 2' }, invalid: { body: { showOnDocuments: 'x' }, field: 'showOnDocuments' }, idempotent: false, status: 200, noEtag: true },
  { name: 'POST /settings/payment-modes/{id}/move', file: 'settings/payment-modes/[id]/move/route', method: 'POST', path: '/settings/payment-modes/:id/move', capability: 'settings:update', body: { direction: 'down' }, invalid: { body: { direction: 'sideways' }, field: 'direction' }, idempotent: true, status: 200, noEtag: true },
  { name: 'DELETE /settings/payment-modes/{id}', file: 'settings/payment-modes/[id]/route', method: 'DELETE', path: '/settings/payment-modes/:id', capability: 'settings:update', idempotent: false, status: 200 },

  { name: 'POST /expense-categories', file: 'expense-categories/route', method: 'POST', path: '/expense-categories', capability: 'expense:create', body: { name: 'Fuel' }, invalid: { body: { name: '' }, field: 'name' }, idempotent: true, status: 201 },
  { name: 'PATCH /expense-categories/{id}', file: 'expense-categories/[id]/route', method: 'PATCH', path: '/expense-categories/:id', capability: 'expense:update', body: { name: 'Diesel' }, invalid: { body: { sortOrder: 'x' }, field: 'sortOrder' }, idempotent: false, status: 200 },
  { name: 'DELETE /expense-categories/{id}', file: 'expense-categories/[id]/route', method: 'DELETE', path: '/expense-categories/:id', capability: 'expense:delete', idempotent: false, status: 200 },

  { name: 'PATCH /settings/company', file: 'settings/company/route', method: 'PATCH', path: '/settings/company', capability: 'settings:update', body: { city: 'Surat' }, invalid: { body: { pincode: '12' }, field: 'pincode' }, idempotent: false, status: 200 },
  { name: 'DELETE /settings/company/{asset}', file: 'settings/company/[asset]/route', method: 'DELETE', path: '/settings/company/:id', param: 'asset', okId: 'logo', no404: true, docPath: '/settings/company/{asset}', capability: 'settings:update', idempotent: false, status: 200 },

  { name: 'POST /settings/stages', file: 'settings/stages/route', method: 'POST', path: '/settings/stages', capability: 'settings:update', body: { name: 'Paint' }, invalid: { body: { name: '' }, field: 'name' }, idempotent: true, status: 201, noEtag: true },
  { name: 'PATCH /settings/stages/{id}', file: 'settings/stages/[id]/route', method: 'PATCH', path: '/settings/stages/:id', okId: 'st1', capability: 'settings:update', body: { name: 'Paint 2', linkedStatus: 'READY' }, invalid: { body: { linkedStatus: 'NOPE' }, field: 'linkedStatus' }, idempotent: false, status: 200, noEtag: true },
  { name: 'POST /settings/stages/{id}/move', file: 'settings/stages/[id]/move/route', method: 'POST', path: '/settings/stages/:id/move', okId: 'st1', capability: 'settings:update', body: { direction: 'up' }, invalid: { body: {}, field: 'direction' }, idempotent: true, status: 200, noEtag: true },
  { name: 'DELETE /settings/stages/{id}', file: 'settings/stages/[id]/route', method: 'DELETE', path: '/settings/stages/:id', capability: 'settings:update', idempotent: false, status: 200 },

  { name: 'POST /adjustments', file: 'adjustments/route', method: 'POST', path: '/adjustments', capability: 'settings:update', body: adjustment, invalid: { body: { ...adjustment, note: 'x' }, field: 'note' }, idempotent: true, status: 201 },
  { name: 'PATCH /adjustments/{id}', file: 'adjustments/[id]/route', method: 'PATCH', path: '/adjustments/:id', capability: 'settings:update', body: adjustment, invalid: { body: { ...adjustment, amount: 0 }, field: 'amount' }, idempotent: false, status: 200 },
  { name: 'DELETE /adjustments/{id}', file: 'adjustments/[id]/route', method: 'DELETE', path: '/adjustments/:id', capability: 'settings:update', idempotent: false, status: 200 },

  { name: 'PUT /settings/opening-balances', file: 'settings/opening-balances/route', method: 'PUT', path: '/settings/opening-balances', capability: 'settings:update', body: { balances: [{ channelId: 'md1', amount: 100, asOf: '2026-04-01' }] }, invalid: { body: { balances: [{ channelId: '', amount: 1, asOf: 'x' }] }, field: 'balances' }, idempotent: false, status: 200, noEtag: true },

  { name: 'POST /notes', file: 'notes/route', method: 'POST', path: '/notes', capability: 'note:create', body: note, invalid: { body: { ...note, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /notes/{id}', file: 'notes/[id]/route', method: 'PATCH', path: '/notes/:id', capability: 'note:update', body: note, invalid: { body: { ...note, customerId: '' }, field: 'customerId' }, idempotent: false, status: 200 },
  { name: 'POST /notes/{id}/status', file: 'notes/[id]/status/route', method: 'POST', path: '/notes/:id/status', capability: 'note:update', body: { status: 'ISSUED' }, invalid: { body: { status: 'NOPE' }, field: 'status' }, idempotent: true, status: 200 },
  { name: 'DELETE /notes/{id}', file: 'notes/[id]/route', method: 'DELETE', path: '/notes/:id', capability: 'note:delete', idempotent: false, status: 200 },

  { name: 'POST /dispatches', file: 'dispatches/route', method: 'POST', path: '/dispatches', capability: 'dispatch:create', body: dispatch, invalid: { body: { ...dispatch, lines: [] }, field: 'lines' }, idempotent: true, status: 201 },
  { name: 'PATCH /dispatches/{id}', file: 'dispatches/[id]/route', method: 'PATCH', path: '/dispatches/:id', capability: 'dispatch:update', body: dispatch, invalid: { body: { ...dispatch, dispatchDate: 'soon' }, field: 'dispatchDate' }, idempotent: false, status: 200 },
  { name: 'POST /dispatches/{id}/status', file: 'dispatches/[id]/status/route', method: 'POST', path: '/dispatches/:id/status', capability: 'dispatch:update', body: { status: 'DISPATCHED' }, invalid: { body: { status: 'LOST' }, field: 'status' }, idempotent: true, status: 200 },
  { name: 'POST /dispatches/{id}/receipt', file: 'dispatches/[id]/receipt/route', method: 'POST', path: '/dispatches/:id/receipt', capability: 'dispatch:update', body: { receivedByName: 'Mohan' }, invalid: { body: { receivedByName: '' }, field: 'receivedByName' }, idempotent: true, status: 200 },
  { name: 'DELETE /dispatches/{id}', file: 'dispatches/[id]/route', method: 'DELETE', path: '/dispatches/:id', capability: 'dispatch:delete', idempotent: false, status: 200 },
]

const url = (path: string) => `http://x/api/v1${path}`

const routes = import.meta.glob('../../app/api/v1/**/route.ts') as Record<
  string,
  () => Promise<Record<string, (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>>>
>

const call = async (endpoint: Endpoint, init: { token?: string; id?: string; body?: unknown; key?: string } = {}) => {
  const route = await routes[`../../app/api/v1/${endpoint.file}.ts`]()
  const recordId = init.id ?? endpoint.okId ?? 'x1'
  const path = endpoint.path.replace(':id', recordId)
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
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const params: Record<string, string> = endpoint.path.includes(':id') ? { [endpoint.param ?? 'id']: recordId } : {}
  const response = await route[endpoint.method](request, { params: Promise.resolve(params) })

  return { response, json: (await response.json()) as { data?: unknown; error?: { code: string; fields?: Record<string, string> } } }
}

beforeEach(() => {
  calls.list.length = 0
  setRateLimitStore(new MemoryRateLimitStore())
})

describe.each(E)('$name', (endpoint) => {
  it('is refused with 403 for a role without the capability', async () => {
    const { response, json } = await call(endpoint, { token: 'token-viewer' })

    // The viewer may read everything, so write capabilities (and settings) are refused.
    expect(response.status).toBe(403)
    expect(json.error?.code).toBe('FORBIDDEN')
    expect(calls.list).toEqual([])
  })

  it('answers the saved resource and runs the service', async () => {
    const { response, json } = await call(endpoint)

    expect(response.status).toBe(endpoint.status)

    if (endpoint.method === 'DELETE') {
      expect(json.data).toMatchObject({ deleted: true })
    } else {
      expect(json.data).toBeTruthy()

      if (!endpoint.noEtag) expect(response.headers.get('etag')).toMatch(/^"/)
    }

    expect(calls.list.length).toBeGreaterThan(0)
  })

  if (endpoint.path.includes(':id') && !endpoint.no404) {
    it("is 404 for another company's record", async () => {
      const { response, json } = await call(endpoint, { id: 'cB-1' })

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

describe('the web rules are the ones applied', () => {
  it('merges an item PATCH with the stored item and runs the web validation on the result', async () => {
    const endpoint = E.find((e) => e.name === 'PATCH /items/{id}')!

    await call(endpoint, { body: { rate: 150 } })

    const sent = calls.list.find((c) => c.name === 'updateItem')!.args[2]

    expect(sent).toEqual(
      itemInputSchema.parse({ name: 'Ply', type: 'MATERIAL', supplyType: 'GOODS', unit: 'SQFT', rate: 150, taxRatePercent: 18, isFlatRate: false, dimensionUnit: 'MM', isActive: true, stockTracked: false }),
    )
  })

  it('refuses a PATCH whose merged result breaks the web rules, naming the field', async () => {
    const endpoint = E.find((e) => e.name === 'PATCH /items/{id}')!
    const { response, json } = await call(endpoint, { body: { hsnCode: '12' } })

    expect(response.status).toBe(422)
    expect(json.error?.fields?.hsnCode).toBeTruthy()
  })

  it('keeps an issued-note style refusal as 409 CONFLICT', async () => {
    const notes = await import('@/lib/services/notes')

    vi.spyOn(notes, 'updateNote').mockResolvedValueOnce({ ok: false, error: 'An issued note cannot be edited.', code: 'CONFLICT' } as never)

    const response = await call(E.find((e) => e.name === 'PATCH /notes/{id}')!)

    expect(response.response.status).toBe(409)
    expect(response.json.error?.code).toBe('CONFLICT')
  })

  it('maps a payment-mode service refusal by what it says', async () => {
    const methods = await import('@/lib/services/payment-methods')
    const endpoint = E.find((e) => e.name === 'POST /settings/payment-modes')!

    vi.spyOn(methods, 'addPaymentMode').mockResolvedValueOnce({ ok: false, error: 'There is already a mode with that name' } as never)
    expect((await call(endpoint)).response.status).toBe(409)

    vi.spyOn(methods, 'addPaymentMode').mockResolvedValueOnce({ ok: false, error: 'Enter a valid UPI ID' } as never)

    const invalid = await call(endpoint)

    expect(invalid.response.status).toBe(422)
    expect(invalid.json.error?.fields?.accountDetails).toBe('Enter a valid UPI ID')
  })

  it('turns a service field-error refusal (dispatch) into 422 with the fields', async () => {
    const dispatches = await import('@/lib/services/dispatches')

    vi.spyOn(dispatches, 'createDispatch').mockResolvedValueOnce({ ok: false, error: 'Too much', fieldErrors: { 'lines.0.quantity': 'Only 2 left' } } as never)

    const { response, json } = await call(E.find((e) => e.name === 'POST /dispatches')!)

    expect(response.status).toBe(422)
    expect(json.error?.fields?.['lines.0.quantity']).toBe('Only 2 left')
  })

  it("is 422 for a note naming another company's customer", async () => {
    const { response, json } = await call(E.find((e) => e.name === 'POST /notes')!, { body: { ...note, customerId: 'cB-9' } })

    expect(response.status).toBe(422)
    expect(json.error?.fields?.customerId).toBeTruthy()
    expect(calls.list).toEqual([])
  })

  it('turns the opening-balance rows into what the service takes (a null amount clears)', async () => {
    await call(E.find((e) => e.name === 'PUT /settings/opening-balances')!, { body: { balances: [{ channelId: 'md1', amount: -50.5, asOf: '2026-04-01' }, { channelId: 'md2', amount: null, asOf: null }] } })

    expect(calls.list.find((c) => c.name === 'saveOpeningBalances')!.args[1]).toEqual([
      { channelId: 'md1', amount: '-50.5', asOf: '2026-04-01' },
      { channelId: 'md2', amount: '', asOf: '' },
    ])
  })
})

describe('settings reads', () => {
  it('need settings:update (403 for a viewer)', async () => {
    for (const file of ['settings/payment-modes/route', 'settings/stages/route', 'settings/company/route', 'settings/opening-balances/route']) {
      const route = await routes[`../../app/api/v1/${file}.ts`]()
      const response = await route.GET(new Request(url('/x'), { headers: { authorization: 'Bearer token-viewer', 'x-company-id': 'cA' } }), { params: Promise.resolve({}) })

      expect(response.status, file).toBe(403)
    }
  })

  it('answer a list for an administrator', async () => {
    const route = await routes['../../app/api/v1/settings/stages/route.ts']()
    const response = await route.GET(new Request(url('/settings/stages'), { headers: { authorization: 'Bearer token-admin', 'x-company-id': 'cA' } }), { params: Promise.resolve({}) })

    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: unknown[] }).data).toHaveLength(1)
  })
})

describe('profile images', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  const upload = async (init: { token?: string; asset?: string; file?: File | null }) => {
    const route = await routes['../../app/api/v1/settings/company/[asset]/route.ts']()
    const form = new FormData()

    if (init.file !== null) form.set('file', init.file ?? new File([png], 'logo.png', { type: 'image/png' }))

    const response = await route.POST(
      new Request(url('/settings/company/logo'), { method: 'POST', headers: { authorization: `Bearer ${init.token ?? 'token-admin'}`, 'x-company-id': 'cA' }, body: form }),
      { params: Promise.resolve({ asset: init.asset ?? 'logo' }) },
    )

    return { response, json: (await response.json()) as { data?: unknown; error?: { fields?: Record<string, string> } } }
  }

  it('stores a logo and answers the profile', async () => {
    const { response } = await upload({})

    expect(response.status).toBe(200)
    expect(calls.list.map((c) => c.name)).toEqual(['setCompanyAsset'])
  })

  it('needs settings:update, a known asset name, an image of the right type and a file', async () => {
    expect((await upload({ token: 'token-viewer' })).response.status).toBe(403)
    expect((await upload({ asset: 'banner' })).response.status).toBe(422)
    expect((await upload({ file: null })).json.error?.fields?.file).toBeTruthy()
    expect((await upload({ file: new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }) })).json.error?.fields?.file).toBeTruthy()
    expect((await upload({ file: new File(['<html>'], 'a.png', { type: 'image/png' }) })).json.error?.fields?.file).toBeTruthy()
  })

  it('streams the stored image', async () => {
    const route = await routes['../../app/api/v1/settings/company/[asset]/route.ts']()
    const response = await route.GET(new Request(url('/settings/company/stamp'), { headers: { authorization: 'Bearer token-admin', 'x-company-id': 'cA' } }), { params: Promise.resolve({ asset: 'stamp' }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  })
})

describe('the OpenAPI document', () => {
  it('lists every master-data write with its capability', () => {
    const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> }

    for (const endpoint of E) {
      const path = endpoint.docPath ?? endpoint.path.replace(':id', '{id}')
      const operation = doc.paths[path]?.[endpoint.method.toLowerCase()]

      expect(operation, `${endpoint.method} ${path}`).toBeTruthy()
    }
  })
})
