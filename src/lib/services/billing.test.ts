import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_WEBHOOK_AUTH, MockProvider } from '@/lib/billing/mock-provider'
import { setProviderForTests } from '@/lib/billing/provider'

type Row = Record<string, unknown>

// A tiny in-memory stand-in for the three tables billing touches.
const db = vi.hoisted(() => ({
  payments: [] as Row[],
  subs: [] as Row[],
  logs: [] as Row[],
}))

vi.mock('@/lib/prisma', () => {
  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in (v as Row) ? row[k] !== (v as Row).not : row[k] === v,
    )

  const prisma = {
    billingPayment: {
      create: async ({ data }: { data: Row }) => (db.payments.push({ ...data }), data),
      findFirst: async ({ where }: { where: Row }) => db.payments.find((r) => match(r, where)) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = db.payments.filter((r) => match(r, where))

        rows.forEach((r) => Object.assign(r, data))

        return { count: rows.length }
      },
      update: async ({ where, data }: { where: Row; data: Row }) =>
        Object.assign(db.payments.find((r) => match(r, where)) as Row, data),
    },
    companySubscription: {
      findUnique: async ({ where }: { where: Row }) => db.subs.find((r) => match(r, where)) ?? null,
      create: async ({ data }: { data: Row }) => (db.subs.push({ ...data }), data),
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const row = db.subs.find((r) => match(r, where))

        if (row) return Object.assign(row, update)
        db.subs.push({ ...create })

        return create
      },
    },
    activityLog: { create: async ({ data }: { data: Row }) => (db.logs.push(data), data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  }

  return { prisma }
})

import { confirmPayment, createCheckoutOrder, handleWebhook, settlePayment } from '@/lib/services/billing'

const actor = { id: 'u1', name: 'Asha' }
const hook = (merchantOrderId: string, event = 'checkout.order.completed') =>
  JSON.stringify({ event, payload: { merchantOrderId, state: 'COMPLETED' } })

const paidSubs = () => db.subs.filter((s) => s.plan !== 'FREE')

let mock: MockProvider

async function order(companyId = 'A', plan = 'BUSINESS') {
  const result = await createCheckoutOrder({ companyId, actor, plan })

  if (!result.ok) throw new Error(result.error)

  return result.paymentId
}

beforeEach(() => {
  db.payments.length = 0
  db.subs.length = 0
  db.logs.length = 0
  mock = new MockProvider()
  setProviderForTests(mock)
})

describe('checkout', () => {
  it('says paid plans open soon when no provider is configured', async () => {
    setProviderForTests(null)
    await expect(createCheckoutOrder({ companyId: 'A', actor, plan: 'BUSINESS' })).resolves.toEqual({
      ok: false,
      error: 'Paid plans open soon',
    })
  })

  it('rejects the free plan and unknown plans', async () => {
    await expect(createCheckoutOrder({ companyId: 'A', actor, plan: 'FREE' })).resolves.toMatchObject({ ok: false })
    await expect(createCheckoutOrder({ companyId: 'A', actor, plan: 'GOLD' })).resolves.toMatchObject({ ok: false })
  })
})

describe('settling a payment', () => {
  it('upgrades once however often it is confirmed or called back', async () => {
    const id = await order()

    expect((await confirmPayment({ companyId: 'A', merchantOrderId: id })).outcome).toBe('paid')
    expect((await confirmPayment({ companyId: 'A', merchantOrderId: id })).outcome).toBe('already-paid')

    const hookResult = await handleWebhook({ rawBody: hook(id), authorization: MOCK_WEBHOOK_AUTH })

    expect(hookResult.status).toBe(200)
    expect(db.subs).toHaveLength(1)
    expect(db.subs[0]).toMatchObject({ plan: 'BUSINESS', source: 'SELF_SERVE' })
    expect(db.logs).toHaveLength(1)
  })

  it('derives the company from the stored order, not from the request', async () => {
    const id = await order('A')

    await handleWebhook({
      rawBody: JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: id, companyId: 'B' } }),
      authorization: MOCK_WEBHOOK_AUTH,
    })
    expect(paidSubs().map((s) => s.companyId)).toEqual(['A'])
  })

  it('does not let another company confirm this company\'s order', async () => {
    const id = await order('A')

    expect((await confirmPayment({ companyId: 'B', merchantOrderId: id })).outcome).toBe('not-found')
    expect(paidSubs()).toHaveLength(0)
  })

  it('refuses a webhook with bad credentials and ignores unknown orders', async () => {
    const id = await order()

    expect((await handleWebhook({ rawBody: hook(id), authorization: 'nope' })).status).toBe(401)
    expect((await handleWebhook({ rawBody: hook('missing'), authorization: MOCK_WEBHOOK_AUTH })).status).toBe(200)
    expect(paidSubs()).toHaveLength(0)
  })

  it('does not upgrade while pending or when the amount differs', async () => {
    const pending = await order()

    mock.setState(pending, 'PENDING')
    expect((await settlePayment(pending)).outcome).toBe('pending')

    const wrong = await order()

    mock.setState(wrong, 'COMPLETED', 1)
    expect((await settlePayment(wrong)).outcome).toBe('failed')
    expect(paidSubs()).toHaveLength(0)
  })

  it('does not downgrade a higher active plan, and extends from the current end', async () => {
    // Both were started before either was paid (checkout refuses a lower plan once Pro runs).
    const pro = await order('A', 'BUSINESS_PRO')
    const lower = await order('A', 'BUSINESS')

    await settlePayment(pro)

    const first = db.subs[0].currentPeriodEnd as Date

    expect((await settlePayment(lower)).outcome).toBe('paid')
    expect(db.subs[0]).toMatchObject({ plan: 'BUSINESS_PRO', currentPeriodEnd: first })
    await expect(createCheckoutOrder({ companyId: 'A', actor, plan: 'BUSINESS' })).resolves.toMatchObject({ ok: false })
  })
})
