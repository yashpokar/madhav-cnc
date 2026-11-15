import { afterAll, describe, expect, it, vi } from 'vitest'

// Real-database checks. Skipped unless API_DB_TEST=1 and DATABASE_URL points at
// a scratch database with the migrations applied (never point it at real data):
//   API_DB_TEST=1 DATABASE_URL=postgresql://.../scratch_api vitest run src/lib/api/db.test.ts

const enabled = process.env.API_DB_TEST === '1' && Boolean(process.env.DATABASE_URL)

vi.mock('@/lib/auth', () => ({ auth: {} }))
vi.mock('@/lib/session', () => ({
  getBaseUser: async () => ({ id: 'db-test-user', isSuperAdmin: true, isActive: true }),
}))

describe.skipIf(!enabled)('api against a real database', () => {
  const run = async () => {
    const { prisma } = await import('@/lib/prisma')
    const { runInRequestContext } = await import('@/lib/api/request-context')
    const { prismaIdempotencyStore } = await import('@/lib/api/idempotency-store')
    const { runIdempotent, hashRequest } = await import('@/lib/api/idempotency')

    return { prisma, runInRequestContext, prismaIdempotencyStore, runIdempotent, hashRequest }
  }

  afterAll(async () => {
    const { prisma } = await run()

    await prisma.idempotencyKey.deleteMany({ where: { userId: 'db-test-user', companyId: { not: '__x__' } } })
    await prisma.user.deleteMany({ where: { id: 'db-test-user' } })
    await prisma.companySetting.deleteMany({ where: { id: { in: ['db-co-a', 'db-co-b'] } } })
  })

  it('replays an idempotent call and refuses a different request, per company', async () => {
    const { prisma, prismaIdempotencyStore: store, runIdempotent, hashRequest } = await run()

    await prisma.user.create({
      data: { id: 'db-test-user', name: 'T', email: 'db-test@x.invalid', isActive: true, role: 'ADMIN' },
    })

    const scope = { userId: 'db-test-user', companyId: '', key: 'db-key-00000001' }
    const req = (body: string) => ({ method: 'POST', path: '/x', requestHash: hashRequest('POST', '/x', body) })
    let runs = 0
    const go = () => runIdempotent(store, scope, req('{}'), async () => ({ status: 201, body: { data: { n: ++runs } } }))

    const first = await go()
    const second = await go()

    expect(first.replayed).toBe(false)
    expect(second).toMatchObject({ replayed: true, status: 201, body: { data: { n: 1 } } })
    expect(runs).toBe(1)

    await expect(
      runIdempotent(store, scope, req('{"x":1}'), async () => ({ status: 200, body: {} })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('shows a company only its own scoped rows, taking the company from the request context', async () => {
    const { prisma, runInRequestContext } = await run()

    await prisma.companySetting.createMany({
      data: [
        { id: 'db-co-a', companyName: 'DB Test A' },
        { id: 'db-co-b', companyName: 'DB Test B' },
      ],
    })

    // Written with explicit companies, like the idempotency store does.
    await prisma.idempotencyKey.createMany({
      data: [
        { userId: 'db-test-user', companyId: 'db-co-a', key: 'scoped-key-a1', method: 'POST', path: '/a', requestHash: 'h' },
        { userId: 'db-test-user', companyId: 'db-co-b', key: 'scoped-key-b1', method: 'POST', path: '/b', requestHash: 'h' },
      ],
    })

    const seenFrom = (companyId: string) =>
      runInRequestContext({ companyId }, async () =>
        (await prisma.idempotencyKey.findMany({ where: { userId: 'db-test-user' } })).map((r) => r.key).sort(),
      )

    const [a, b] = await Promise.all([seenFrom('db-co-a'), seenFrom('db-co-b')])

    expect(a).toEqual(['scoped-key-a1'])
    expect(b).toEqual(['scoped-key-b1'])

    // An unknown company id sees nothing (scope "none"), never the first company.
    expect(await seenFrom('db-no-such')).toEqual([])
    expect(await runInRequestContext({}, async () => prisma.idempotencyKey.count())).toBe(0)
  })
})
