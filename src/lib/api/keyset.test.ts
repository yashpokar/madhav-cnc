import { describe, expect, it } from 'vitest'
import { keyOf, keysetClause } from '@/lib/api/keyset'
import { decodeCursor, encodeCursor } from '@/lib/api/cursor'
import { at, money } from '@/lib/api/reads/format'

describe('keysetClause', () => {
  it('is empty for the first page', () => {
    expect(keysetClause(undefined, 'createdAt', 'desc', 'date')).toEqual({})
    expect(keysetClause({ take: 11, after: null }, 'createdAt', 'desc', 'date')).toEqual({})
  })

  it('compares (field, id) in the sort direction', () => {
    const when = '2026-01-10T00:00:00.000Z'

    expect(keysetClause({ take: 11, after: { k: when, id: 'c3' } }, 'createdAt', 'desc', 'date')).toEqual({
      OR: [{ createdAt: { lt: new Date(when) } }, { createdAt: new Date(when), id: { lt: 'c3' } }],
    })
    expect(keysetClause({ take: 11, after: { k: 'Ply', id: 'i1' } }, 'name', 'asc', 'string')).toEqual({
      OR: [{ name: { gt: 'Ply' } }, { name: 'Ply', id: { gt: 'i1' } }],
    })
  })

  it('refuses a date cursor that is not a date', () => {
    expect(() => keysetClause({ take: 11, after: { k: 'nope', id: 'x' } }, 'createdAt', 'desc', 'date')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    )
  })
})

describe('cursor round trip', () => {
  it('a row position survives encode and decode', () => {
    const position = at(new Date('2026-01-10T05:30:00.000Z'), 'abc')

    expect(decodeCursor(encodeCursor(position))).toEqual({ k: '2026-01-10T05:30:00.000Z', id: 'abc' })
    expect(keyOf('Ply')).toBe('Ply')
  })
})

describe('money', () => {
  it('is a two-place decimal string', () => {
    expect(money(12345.5)).toBe('12345.50')
    expect(money(0.1 + 0.2)).toBe('0.30')
    expect(money(-3)).toBe('-3.00')
  })
})
