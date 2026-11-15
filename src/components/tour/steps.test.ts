import { describe, expect, it } from 'vitest'
import { can } from '@/lib/permissions'
import { MAX_STEPS, resolveSteps, type TargetProbe } from './steps'

const everything = [
  'company-switcher',
  'search',
  'create-menu',
  'nav:/orders',
  'nav:/quotations',
  'nav:/invoices',
  'nav:/payments',
  'nav:/customers',
  'nav:/items',
  'nav:/settings/company',
  'account-menu',
]

function ctx(
  role: Parameters<typeof can>[0],
  present: string[],
  opts: { mobile?: boolean; hidden?: string[] } = {},
) {
  return {
    can: (c: Parameters<typeof can>[1]) => can(role, c),
    mobile: opts.mobile ?? false,
    probe: (t: string): TargetProbe =>
      !present.includes(t)
        ? { state: 'missing' }
        : { state: opts.hidden?.includes(t) ? 'hidden' : 'visible', label: `L(${t})` },
  }
}

describe('resolveSteps', () => {
  it('returns every step in order when all targets exist', () => {
    const ids = resolveSteps(ctx('ADMIN', everything)).map((s) => s.id)
    expect(ids).toEqual(['company', 'search', 'create', 'sell', 'money', 'people', 'settings', 'account'])
    expect(ids.length).toBeLessThanOrEqual(MAX_STEPS)
  })

  it('skips steps whose targets are missing', () => {
    const ids = resolveSteps(ctx('ADMIN', ['company-switcher', 'nav:/invoices', 'account-menu'])).map((s) => s.id)
    expect(ids).toEqual(['company', 'money', 'account'])
  })

  it('falls back to the next target and uses its label', () => {
    const steps = resolveSteps(ctx('ADMIN', ['nav:/quotations']))
    expect(steps).toHaveLength(1)
    expect(steps[0].target).toBe('nav:/quotations')
    expect(steps[0].body).toContain('L(nav:/quotations)')
  })

  it('hides the settings step from roles that cannot update settings', () => {
    const ids = resolveSteps(ctx('SALES', everything)).map((s) => s.id)
    expect(ids).not.toContain('settings')
  })

  it('does not tell a viewer they can bill customers', () => {
    const money = resolveSteps(ctx('VIEWER', everything)).find((s) => s.id === 'money')!
    expect(money.body).not.toMatch(/bill customers/)
    const admin = resolveSteps(ctx('ADMIN', everything)).find((s) => s.id === 'money')!
    expect(admin.body).toMatch(/bill customers/)
  })

  it('turns drawer-only targets into centered cards on mobile', () => {
    const steps = resolveSteps(ctx('ADMIN', ['nav:/orders'], { mobile: true, hidden: ['nav:/orders'] }))
    expect(steps).toHaveLength(1)
    expect(steps[0].target).toBeNull()
    expect(steps[0].body).toContain('Open the menu')
  })

  it('skips hidden targets on desktop', () => {
    const ids = resolveSteps(ctx('ADMIN', everything, { hidden: ['nav:/orders', 'nav:/quotations'] })).map((s) => s.id)
    expect(ids).not.toContain('sell')
  })

  it('prefers a visible target over a hidden one', () => {
    const sell = resolveSteps(ctx('ADMIN', everything, { mobile: true, hidden: ['nav:/orders'] })).find(
      (s) => s.id === 'sell',
    )!
    expect(sell.target).toBe('nav:/quotations')
  })
})
