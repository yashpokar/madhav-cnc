import { describe, expect, it, vi } from 'vitest'

// Next memoises cache() functions for the length of a request. Mimic that, to
// prove the company scope of an API request is not decided by a call made
// before the handler's context exists (it used to be: a person with two
// companies read the FIRST company's rows whatever X-Company-Id said).
vi.mock('react', () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()

    return (...args: A) => {
      const key = JSON.stringify(args)

      if (!memo.has(key)) memo.set(key, fn(...args))

      return memo.get(key) as R
    }
  },
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ redirect: () => undefined }))

vi.mock('@/lib/session', () => ({
  getBaseUser: async () => ({ id: 'u', isSuperAdmin: false, isActive: true }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companySetting: {
      // the person may open both; the first in order is c1
      findMany: async () => [
        { id: 'c1', companyName: 'One' },
        { id: 'c2', companyName: 'Two' },
      ],
    },
  },
}))

const { getCompanyScope } = await import('@/lib/active-company')
const { runInRequestContext } = await import('@/lib/api/request-context')

describe('getCompanyScope inside the API request context', () => {
  it('uses the company named by the request even after an earlier call outside the context', async () => {
    // e.g. the company check that runs before the handler's context starts
    const before = await getCompanyScope()

    expect(before).toEqual({ kind: 'company', companyId: 'c1' })

    const inside = await runInRequestContext({ companyId: 'c2' }, () => getCompanyScope())

    expect(inside).toEqual({ kind: 'company', companyId: 'c2' })
  })

  it('keeps two companies apart within one request', async () => {
    const one = await runInRequestContext({ companyId: 'c1' }, () => getCompanyScope())
    const two = await runInRequestContext({ companyId: 'c2' }, () => getCompanyScope())

    expect([one, two]).toEqual([
      { kind: 'company', companyId: 'c1' },
      { kind: 'company', companyId: 'c2' },
    ])
  })

  it('an API request that names no company sees none, never the first', async () => {
    expect(await runInRequestContext({}, () => getCompanyScope())).toEqual({ kind: 'none' })
  })

  it('a company the person may not open is none', async () => {
    expect(await runInRequestContext({ companyId: 'c9' }, () => getCompanyScope())).toEqual({ kind: 'none' })
  })
})

describe('request context', () => {
  it('is one store even when the bundler loads the module twice (a second copy used to be blind)', async () => {
    const first = await import('@/lib/api/request-context')

    vi.resetModules()

    const second = await import('@/lib/api/request-context')

    expect(second).not.toBe(first)
    expect(second.requestContext).toBe(first.requestContext)

    const seen = await first.runInRequestContext({ companyId: 'c2' }, async () => second.requestContext.getStore())

    expect(seen).toEqual({ companyId: 'c2' })
  })
})
