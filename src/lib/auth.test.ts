import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('auth config', () => {
  it('builds with bearer, expo and nextCookies (nextCookies last)', async () => {
    const { auth } = await import('@/lib/auth')
    const ids = (auth.options.plugins ?? []).map((p: { id: string }) => p.id)

    expect(ids).toContain('bearer')
    expect(ids).toContain('expo')
    expect(ids.indexOf('expo')).toBeLessThan(ids.indexOf('next-cookies'))
    expect(ids[ids.length - 1]).toBe('next-cookies')
  })

  it('trusts the prodlys:// app scheme', async () => {
    const { auth } = await import('@/lib/auth')
    const origins = auth.options.trustedOrigins as string[]

    expect(origins).toEqual(expect.arrayContaining(['prodlys://', 'prodlys://*']))
  })
})
