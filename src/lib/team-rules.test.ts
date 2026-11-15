import { describe, expect, it } from 'vitest'
import {
  MAX_SELF_COMPANIES,
  canCreateAnotherCompany,
  checkAddMember,
  checkChangeMember,
  countCompanyAdmins,
  isValidRole,
} from './team-rules'

const admin = { globalRole: 'VIEWER', membershipRole: 'ADMIN' } as const
const admin2 = { globalRole: 'VIEWER', membershipRole: 'ADMIN' } as const
const sales = { globalRole: 'VIEWER', membershipRole: 'SALES' } as const
const superAdmin = { globalRole: 'ADMIN', membershipRole: null } as const

describe('isValidRole', () => {
  it('accepts real roles only', () => {
    expect(isValidRole('SALES')).toBe(true)
    expect(isValidRole('ADMIN')).toBe(true)
    expect(isValidRole('OWNER')).toBe(false)
    expect(isValidRole(undefined)).toBe(false)
  })
})

describe('canCreateAnotherCompany', () => {
  it('stops at the cap', () => {
    expect(canCreateAnotherCompany(MAX_SELF_COMPANIES - 1)).toBe(true)
    expect(canCreateAnotherCompany(MAX_SELF_COMPANIES)).toBe(false)
  })
})

describe('countCompanyAdmins', () => {
  it('counts company admins and ignores super-admins', () => {
    expect(countCompanyAdmins([admin, sales, superAdmin])).toBe(1)
  })
  it('lets an unset membership inherit the default role', () => {
    expect(countCompanyAdmins([{ globalRole: 'SALES', membershipRole: null }])).toBe(0)
  })
})

describe('checkAddMember', () => {
  const base = {
    role: 'SALES',
    targetGlobalRole: 'VIEWER',
    alreadyMember: false,
    targetDisabled: false,
  } as const

  it('allows a normal add', () => expect(checkAddMember(base).ok).toBe(true))
  it('rejects an unknown role', () => expect(checkAddMember({ ...base, role: 'X' }).ok).toBe(false))
  it('rejects super-admins and disabled accounts with the same message', () => {
    const a = checkAddMember({ ...base, targetGlobalRole: 'ADMIN' })
    const b = checkAddMember({ ...base, targetDisabled: true })
    expect(a).toEqual(b)
    expect(a.ok).toBe(false)
  })
  it('rejects someone already in the company', () =>
    expect(checkAddMember({ ...base, alreadyMember: true }).ok).toBe(false))
})

describe('checkChangeMember', () => {
  it('cannot act on a super-admin', () => {
    const members = [admin, superAdmin]
    expect(checkChangeMember({ target: superAdmin, members, change: { type: 'remove' } }).ok).toBe(false)
    expect(
      checkChangeMember({ target: superAdmin, members, change: { type: 'role', role: 'VIEWER' } }).ok,
    ).toBe(false)
  })
  it('protects the last administrator from removal and demotion', () => {
    const members = [admin, sales]
    expect(checkChangeMember({ target: admin, members, change: { type: 'remove' } }).ok).toBe(false)
    expect(
      checkChangeMember({ target: admin, members, change: { type: 'role', role: 'SALES' } }).ok,
    ).toBe(false)
  })
  it('allows it when another administrator remains', () => {
    const members = [admin, admin2, sales]
    expect(checkChangeMember({ target: admin, members, change: { type: 'remove' } }).ok).toBe(true)
    expect(
      checkChangeMember({ target: admin, members, change: { type: 'role', role: 'SALES' } }).ok,
    ).toBe(true)
  })
  it('lets the last administrator stay an administrator', () => {
    expect(
      checkChangeMember({ target: admin, members: [admin], change: { type: 'role', role: 'ADMIN' } }).ok,
    ).toBe(true)
  })
  it('rejects an invalid role and allows removing a non-admin', () => {
    expect(
      checkChangeMember({ target: sales, members: [admin, sales], change: { type: 'role', role: 'NOPE' } }).ok,
    ).toBe(false)
    expect(checkChangeMember({ target: sales, members: [admin, sales], change: { type: 'remove' } }).ok).toBe(true)
  })
})
