import { describe, expect, it } from 'vitest'
import { anonymisedIdentity, deletionBlocks, describeDeletionBlocks, type CompanyMembers } from '@/lib/account-deletion-rules'

const member = (userId: string, membershipRole: 'ADMIN' | 'SALES' | 'VIEWER' | null, globalRole: 'VIEWER' | 'ADMIN' = 'VIEWER') => ({
  userId,
  globalRole,
  membershipRole,
})

const company = (id: string, members: ReturnType<typeof member>[]): CompanyMembers => ({ id, name: `Co ${id}`, members })

const check = (companies: CompanyMembers[], over: Partial<Parameters<typeof deletionBlocks>[0]> = {}) =>
  deletionBlocks({ userId: 'me', globalRole: 'VIEWER', companies, otherActiveSuperAdmins: 1, ...over })

describe('deletionBlocks', () => {
  it('blocks the last administrator of a company that has other members', () => {
    const blocks = check([company('c1', [member('me', 'ADMIN'), member('x', 'SALES')])])

    expect(blocks).toEqual([{ kind: 'last-company-admin', companyId: 'c1', companyName: 'Co c1' }])
    expect(describeDeletionBlocks(blocks)).toContain('only administrator of Co c1')
  })

  it('allows it when another administrator remains', () => {
    expect(check([company('c1', [member('me', 'ADMIN'), member('x', 'ADMIN')])])).toEqual([])
  })

  it('does not count a platform super-admin member as the remaining administrator', () => {
    expect(check([company('c1', [member('me', 'ADMIN'), member('root', null, 'ADMIN')])])).toHaveLength(1)
  })

  it('allows the sole member of a company to leave', () => {
    expect(check([company('c1', [member('me', 'ADMIN')])])).toEqual([])
  })

  it('allows a non-administrator to leave', () => {
    expect(check([company('c1', [member('me', 'SALES'), member('x', 'ADMIN')])])).toEqual([])
    expect(check([company('c1', [member('me', null), member('x', null)])])).toEqual([])
  })

  it('reports every company that would be stranded', () => {
    const blocks = check([
      company('c1', [member('me', 'ADMIN'), member('x', null)]),
      company('c2', [member('me', 'ADMIN'), member('y', 'VIEWER')]),
    ])

    expect(blocks.map((b) => b.kind)).toEqual(['last-company-admin', 'last-company-admin'])
  })

  it('blocks the last platform administrator', () => {
    const blocks = check([], { globalRole: 'ADMIN', otherActiveSuperAdmins: 0 })

    expect(blocks).toEqual([{ kind: 'last-platform-admin' }])
    expect(check([], { globalRole: 'ADMIN', otherActiveSuperAdmins: 1 })).toEqual([])
  })
})

describe('anonymisedIdentity', () => {
  it('can never receive mail and is unique per user', () => {
    expect(anonymisedIdentity('u1')).toEqual({ name: 'Deleted user', email: 'deleted+u1@deleted.invalid' })
    expect(anonymisedIdentity('u2').email).not.toBe(anonymisedIdentity('u1').email)
  })
})
