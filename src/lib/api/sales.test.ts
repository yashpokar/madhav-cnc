import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore, setRateLimitStore } from '@/lib/api/rate-limit'

// DB-free, like writes.test.ts: the session and the services are faked, so these
// check what the sales-gap routes add (capability, body validation, 404 for another
// company's record, the mapping of refusals, idempotent replay).

const users: Record<string, { id: string; role: string }> = {
  'token-admin': { id: 'ua', role: 'VIEWER' },
  'token-viewer': { id: 'uv', role: 'VIEWER' },
}

const membership: Record<string, Record<string, string>> = { ua: { cA: 'ADMIN' }, uv: { cA: 'VIEWER' } }

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
      findMany: async (args: { where: { access?: { some: { userId: string } } } }) =>
        Object.keys(membership[args.where.access?.some.userId ?? ''] ?? {}).map((id) => ({ id, companyName: id })),
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

const calls = vi.hoisted(() => ({ list: [] as { name: string; args: unknown[] }[] }))

const fake = vi.hoisted(
  () =>
    (name: string, extra: Record<string, unknown> = {}) =>
    async (...args: unknown[]) => {
      calls.list.push({ name, args })

      if (args.some((arg) => typeof arg === 'string' && arg.startsWith('cB-'))) {
        return { ok: false, error: 'Record not found' }
      }

      return { ok: true, message: 'Done', id: 'new1', quotationId: 'q1', invoiceId: 'i1', ...extra }
    },
)

const link = { url: 'https://x/t/tok', token: 'tok', whatsappText: 'hi', whatsappLink: 'https://wa.me/?text=hi', created: true }

vi.mock('@/lib/services/customers', () => ({ deleteCustomer: fake('deleteCustomer') }))
vi.mock('@/lib/services/quotations', () => ({
  deleteQuotation: fake('deleteQuotation'),
  createRevision: fake('createRevision'),
  revokeShareLink: fake('revokeShareLink'),
  addStaffComment: fake('addStaffComment'),
}))
vi.mock('@/lib/services/orders', () => ({
  deleteOrder: fake('deleteOrder'),
  createTrackingLink: fake('createTrackingLink', link),
  replaceTrackingLink: fake('replaceTrackingLink', link),
  revokeTrackingLink: fake('revokeTrackingLink'),
}))
vi.mock('@/lib/services/invoices', () => ({
  deleteInvoice: fake('deleteInvoice'),
  duplicateInvoice: fake('duplicateInvoice', { number: 'INV-2' }),
  recordInvoicePayment: fake('recordInvoicePayment'),
  removePaymentAllocation: fake('removePaymentAllocation'),
  writeOffInvoice: fake('writeOffInvoice'),
  removeWriteOff: fake('removeWriteOff'),
  regenerateInvoiceShareLink: fake('regenerateInvoiceShareLink', { token: 'tok2' }),
}))
vi.mock('@/lib/services/payments', () => ({ updateReceiptAllocations: fake('updateReceiptAllocations') }))
vi.mock('@/lib/services/quotation-attachments', () => ({
  attachUpload: fake('attachUpload', { fileName: 'photo', mimeType: 'image/png', sizeBytes: 8, comment: null, approvalCleared: false }),
  setAttachmentComment: fake('setAttachmentComment'),
  removeAttachment: fake('removeAttachment'),
  restoreAttachment: fake('restoreAttachment'),
}))

vi.mock('@/lib/api/sales-helpers', async () => {
  const { ApiError } = await import('@/lib/api/errors')
  const check = async (...ids: string[]) => {
    if (ids.some((id) => id.startsWith('cB-'))) throw new ApiError('NOT_FOUND', 'Not found.')
  }

  return {
    requireAttachment: check,
    requireAllocation: async (...ids: string[]) => {
      await check(...ids)

      return 'al1'
    },
    requireWriteOff: check,
    requireFound: (row: unknown) => {
      if (!row) throw new ApiError('NOT_FOUND', 'Not found.')
    },
  }
})

vi.mock('@/lib/api/reads/detail', () => ({
  quotationDetailFor: async (id: string) => ({ id, kind: 'quotation' }),
  invoiceDetailFor: async (id: string) => ({ id, kind: 'invoice' }),
  paymentDetailFor: async (id: string) => ({ id, kind: 'payment' }),
}))

const exists = (id: string) => (id.startsWith('cB-') ? null : { id })

vi.mock('@/lib/queries/orders', () => ({ getOrder: async (id: string) => exists(id) }))
vi.mock('@/lib/queries/quotations', () => ({ getQuotation: async (id: string) => exists(id) }))
vi.mock('@/lib/queries/invoices', () => ({
  getInvoice: async (id: string) =>
    exists(id) && { id, number: 'INV-1', due: 100, total: 100, customer: { name: 'C', phone: '9999999999' } },
}))
vi.mock('@/lib/queries/company', () => ({ getCompanySetting: async () => ({ companyName: 'Acme' }) }))

type Endpoint = {
  name: string
  file: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  params: Record<string, string>
  capability: string
  body?: unknown
  invalid?: { body: unknown; field: string }
  idempotent: boolean
  status: number
  /** The answer is a record (carries an ETag) rather than a derived reply. */
  etag?: boolean
}

const payment = { amount: 500, methodId: 'm1', paidOn: '2026-11-15' }
const writeOff = { amount: 50, reason: 'DISPUTE', writtenOffOn: '2026-11-15' }

const E: Endpoint[] = [
  { name: 'DELETE /customers/{id}', file: 'customers/[id]/route', method: 'DELETE', path: '/customers/cust1', params: { id: 'cust1' }, capability: 'customer:delete', idempotent: false, status: 200 },
  { name: 'DELETE /quotations/{id}', file: 'quotations/[id]/route', method: 'DELETE', path: '/quotations/q1', params: { id: 'q1' }, capability: 'quotation:delete', idempotent: false, status: 200 },
  { name: 'POST /quotations/{id}/revision', file: 'quotations/[id]/revision/route', method: 'POST', path: '/quotations/q1/revision', params: { id: 'q1' }, capability: 'quotation:create', idempotent: true, status: 201, etag: true },
  { name: 'DELETE /quotations/{id}/share', file: 'quotations/[id]/share/route', method: 'DELETE', path: '/quotations/q1/share', params: { id: 'q1' }, capability: 'quotation:update', idempotent: false, status: 200 },
  { name: 'POST /quotations/{id}/comments', file: 'quotations/[id]/comments/route', method: 'POST', path: '/quotations/q1/comments', params: { id: 'q1' }, capability: 'quotation:update', body: { body: 'Please make it darker' }, invalid: { body: { body: '' }, field: 'body' }, idempotent: true, status: 201 },
  { name: 'POST /quotations/{id}/attachments', file: 'quotations/[id]/attachments/route', method: 'POST', path: '/quotations/q1/attachments', params: { id: 'q1' }, capability: 'quotation:update', body: { uploadId: 'up1', comment: 'ref' }, invalid: { body: {}, field: 'uploadId' }, idempotent: true, status: 201 },
  { name: 'PATCH /quotations/{id}/attachments/{attachmentId}', file: 'quotations/[id]/attachments/[attachmentId]/route', method: 'PATCH', path: '/quotations/q1/attachments/a1', params: { id: 'q1', attachmentId: 'a1' }, capability: 'quotation:update', body: { comment: 'x' }, invalid: { body: {}, field: 'comment' }, idempotent: false, status: 200 },
  { name: 'DELETE /quotations/{id}/attachments/{attachmentId}', file: 'quotations/[id]/attachments/[attachmentId]/route', method: 'DELETE', path: '/quotations/q1/attachments/a1', params: { id: 'q1', attachmentId: 'a1' }, capability: 'quotation:update', idempotent: false, status: 200 },
  { name: 'POST /quotations/{id}/attachments/{attachmentId}/restore', file: 'quotations/[id]/attachments/[attachmentId]/restore/route', method: 'POST', path: '/quotations/q1/attachments/a1/restore', params: { id: 'q1', attachmentId: 'a1' }, capability: 'quotation:update', idempotent: true, status: 200 },
  { name: 'DELETE /orders/{id}', file: 'orders/[id]/route', method: 'DELETE', path: '/orders/o1', params: { id: 'o1' }, capability: 'order:delete', idempotent: false, status: 200 },
  { name: 'POST /orders/{id}/tracking', file: 'orders/[id]/tracking/route', method: 'POST', path: '/orders/o1/tracking', params: { id: 'o1' }, capability: 'order:update', body: { replace: true }, invalid: { body: { replace: 'yes' }, field: 'replace' }, idempotent: true, status: 200 },
  { name: 'DELETE /orders/{id}/tracking', file: 'orders/[id]/tracking/route', method: 'DELETE', path: '/orders/o1/tracking', params: { id: 'o1' }, capability: 'order:update', idempotent: false, status: 200 },
  { name: 'DELETE /invoices/{id}', file: 'invoices/[id]/route', method: 'DELETE', path: '/invoices/i1', params: { id: 'i1' }, capability: 'invoice:delete', idempotent: false, status: 200 },
  { name: 'POST /invoices/{id}/duplicate', file: 'invoices/[id]/duplicate/route', method: 'POST', path: '/invoices/i1/duplicate', params: { id: 'i1' }, capability: 'invoice:create', idempotent: true, status: 201, etag: true },
  { name: 'POST /invoices/{id}/payments', file: 'invoices/[id]/payments/route', method: 'POST', path: '/invoices/i1/payments', params: { id: 'i1' }, capability: 'payment:create', body: payment, invalid: { body: { ...payment, amount: 0 }, field: 'amount' }, idempotent: true, status: 201, etag: true },
  { name: 'DELETE /invoices/{id}/payments/{paymentId}', file: 'invoices/[id]/payments/[paymentId]/route', method: 'DELETE', path: '/invoices/i1/payments/p1', params: { id: 'i1', paymentId: 'p1' }, capability: 'payment:delete', idempotent: false, status: 200, etag: true },
  { name: 'POST /invoices/{id}/write-off', file: 'invoices/[id]/write-off/route', method: 'POST', path: '/invoices/i1/write-off', params: { id: 'i1' }, capability: 'payment:update', body: writeOff, invalid: { body: { ...writeOff, reason: 'NOPE' }, field: 'reason' }, idempotent: true, status: 201, etag: true },
  { name: 'DELETE /invoices/{id}/write-offs/{writeOffId}', file: 'invoices/[id]/write-offs/[writeOffId]/route', method: 'DELETE', path: '/invoices/i1/write-offs/w1', params: { id: 'i1', writeOffId: 'w1' }, capability: 'payment:update', idempotent: false, status: 200, etag: true },
  { name: 'POST /invoices/{id}/share/regenerate', file: 'invoices/[id]/share/regenerate/route', method: 'POST', path: '/invoices/i1/share/regenerate', params: { id: 'i1' }, capability: 'invoice:update', idempotent: true, status: 200 },
  { name: 'PATCH /payments/{id}/allocations', file: 'payments/[id]/allocations/route', method: 'PATCH', path: '/payments/p1/allocations', params: { id: 'p1' }, capability: 'payment:update', body: { allocations: [{ invoiceId: 'i1', amount: 100 }], openingApplied: 0 }, invalid: { body: { allocations: [{ invoiceId: '', amount: 1 }] }, field: 'allocations' }, idempotent: false, status: 200, etag: true },
]

const url = (path: string) => `http://x/api/v1${path}`

const routes = import.meta.glob('../../app/api/v1/**/route.ts') as Record<
  string,
  () => Promise<Record<string, (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>>>
>

const call = async (
  endpoint: Endpoint,
  init: { token?: string; otherCompany?: boolean; body?: unknown; key?: string } = {},
) => {
  const route = await routes[`../../app/api/v1/${endpoint.file}.ts`]()
  const params = init.otherCompany ? { ...endpoint.params, id: 'cB-1' } : endpoint.params
  const path = init.otherCompany ? endpoint.path.replace(/^(\/[a-z-]+\/)[^/]+/, '$1cB-1') : endpoint.path
  const body = 'body' in init ? init.body : endpoint.body
  const headers: Record<string, string> = {
    authorization: `Bearer ${init.token ?? 'token-admin'}`,
    'x-company-id': 'cA',
    'content-type': 'application/json',
  }

  if (init.key) headers['idempotency-key'] = init.key

  const response = await route[endpoint.method](
    new Request(url(path), { method: endpoint.method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve(params) },
  )

  return {
    response,
    json: (await response.json()) as { data?: Record<string, unknown>; error?: { code: string; fields?: Record<string, string> } },
  }
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

  it('answers and runs the service', async () => {
    const { response, json } = await call(endpoint)

    expect(response.status).toBe(endpoint.status)

    if (endpoint.method === 'DELETE' && !endpoint.etag) expect(json.data).toMatchObject({ deleted: true })
    else expect(json.data).toBeTruthy()

    if (endpoint.etag) expect(response.headers.get('etag')).toMatch(/^"/)

    expect(calls.list.length).toBeGreaterThan(0)
  })

  it("is 404 for another company's record", async () => {
    const { response, json } = await call(endpoint, { otherCompany: true })

    expect(response.status).toBe(404)
    expect(json.error?.code).toBe('NOT_FOUND')
  })

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

describe('behaviour', () => {
  it('names the payment method as the channel when recording an invoice payment', async () => {
    await call(E.find((e) => e.name === 'POST /invoices/{id}/payments')!)

    expect(calls.list.find((c) => c.name === 'recordInvoicePayment')!.args[2]).toMatchObject({
      amount: 500,
      channelId: 'm1',
      paidOn: '2026-11-15',
    })
  })

  it('replaces the tracking link only when asked to', async () => {
    const endpoint = E.find((e) => e.name === 'POST /orders/{id}/tracking')!

    await call(endpoint, { body: {} })
    await call(endpoint, { body: { replace: true } })

    expect(calls.list.map((c) => c.name)).toEqual(['createTrackingLink', 'replaceTrackingLink'])
  })

  it('answers a link with url, token, whatsappText and whatsappLink', async () => {
    const { json } = await call(E.find((e) => e.name === 'POST /orders/{id}/tracking')!)

    expect(json.data).toMatchObject({ url: expect.any(String), token: 'tok', whatsappText: 'hi', whatsappLink: expect.any(String) })
  })
})
