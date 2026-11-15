import { describe, expect, it } from 'vitest'
import { effectiveRole } from './company-roles'

describe('effectiveRole', () => {
  it('keeps a platform super-admin as ADMIN whatever the company says', () => {
    expect(effectiveRole({ globalRole: 'ADMIN', membershipRole: null })).toBe('ADMIN')
    expect(effectiveRole({ globalRole: 'ADMIN', membershipRole: 'VIEWER' })).toBe('ADMIN')
  })

  it('inherits the default role when the company sets none', () => {
    expect(effectiveRole({ globalRole: 'SALES', membershipRole: null })).toBe('SALES')
    expect(effectiveRole({ globalRole: 'SALES', membershipRole: undefined })).toBe('SALES')
  })

  it('lets the company role override the default, downward', () => {
    expect(effectiveRole({ globalRole: 'ACCOUNTANT', membershipRole: 'VIEWER' })).toBe('VIEWER')
  })

  it('lets the company role raise a person, for that company only', () => {
    expect(effectiveRole({ globalRole: 'VIEWER', membershipRole: 'ADMIN' })).toBe('ADMIN')
    expect(effectiveRole({ globalRole: 'VIEWER', membershipRole: null })).toBe('VIEWER')
  })
})
