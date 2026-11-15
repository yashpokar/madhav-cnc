import { describe, expect, it } from 'vitest'
import { dueDateFromTerms, parseDefaults, pickRemembered, todayIso } from './form-defaults'
import { matchCreateCommands, singularTerm } from './quick-create'

describe('form defaults', () => {
  it('parses only valid remembered values', () => {
    expect(parseDefaults('{"paymentMode":"UPI","gstRate":18}')).toEqual({ paymentMode: 'UPI', gstRate: 18 })
    expect(parseDefaults('{"gstRate":900}')).toEqual({})
    expect(parseDefaults('garbage')).toEqual({})
  })

  it('falls back when the remembered value is no longer offered', () => {
    expect(pickRemembered(12, [5, 12, 18], 18)).toBe(12)
    expect(pickRemembered(28, [5, 12, 18], 18)).toBe(18)
    expect(pickRemembered(undefined, [5], 5)).toBe(5)
  })

  it('computes due date from terms', () => {
    expect(dueDateFromTerms('2026-01-25', 10)).toBe('2026-02-04')
    expect(dueDateFromTerms('2026-01-25', null)).toBeNull()
    expect(dueDateFromTerms('bad', 5)).toBeNull()
  })

  it('formats today in IST', () => {
    expect(todayIso(new Date('2026-03-01T20:00:00Z'))).toBe('2026-03-02')
  })
})

describe('quick create', () => {
  const commands = [
    { key: 'invoice', label: 'Invoice', href: '/invoices/new', words: [] },
    { key: 'order', label: 'Booking', href: '/orders/new', words: ['order'] },
    { key: 'customer', label: 'Customer', href: '/customers/new', words: ['client'] },
  ]

  it('matches verb plus noun, including industry term and alias', () => {
    expect(matchCreateCommands('new inv', commands).map((c) => c.key)).toEqual(['invoice'])
    expect(matchCreateCommands('new booking', commands).map((c) => c.key)).toEqual(['order'])
    expect(matchCreateCommands('new order', commands).map((c) => c.key)).toEqual(['order'])
  })

  it('lists everything for a bare verb and nothing for short plain text', () => {
    expect(matchCreateCommands('new', commands)).toHaveLength(3)
    expect(matchCreateCommands('i', commands)).toEqual([])
  })

  it('singularises industry terms', () => {
    expect(singularTerm('Bookings')).toBe('Booking')
    expect(singularTerm('Events')).toBe('Event')
  })
})
