import { describe, expect, it } from 'vitest'
import { addRecent, parseRecents, recordKind, type Recent } from './recents'

const row = (n: number): Recent => ({ href: `/orders/${n}`, title: `O${n}`, kind: 'Order' })

describe('recents', () => {
  it('keeps newest first, deduped, capped at 5', () => {
    let list: Recent[] = []

    for (let n = 1; n <= 7; n++) list = addRecent(list, row(n))
    list = addRecent(list, row(5))

    expect(list).toHaveLength(5)
    expect(list[0].href).toBe('/orders/5')
    expect(list.filter((r) => r.href === '/orders/5')).toHaveLength(1)
  })

  it('parses defensively', () => {
    expect(parseRecents('nope')).toEqual([])
    expect(parseRecents('[{"href":"http://x","title":"a","kind":"b"}]')).toEqual([])
    expect(parseRecents(JSON.stringify([row(1)]))).toEqual([row(1)])
  })

  it('recognises record pages only', () => {
    expect(recordKind('/customers/abc')).toBe('Customer')
    expect(recordKind('/customers/new')).toBeNull()
    expect(recordKind('/customers')).toBeNull()
    expect(recordKind('/orders/1/edit')).toBeNull()
  })
})
