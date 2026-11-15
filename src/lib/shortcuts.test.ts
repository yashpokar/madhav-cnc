import { describe, expect, it } from 'vitest'
import { IDLE_CHORD, isTypingContext, resolveKey } from './shortcuts'

describe('resolveKey', () => {
  it('maps single keys', () => {
    expect(resolveKey(IDLE_CHORD, { key: 'c' }, 0).action).toEqual({ type: 'create' })
    expect(resolveKey(IDLE_CHORD, { key: '?' }, 0).action).toEqual({ type: 'help' })
    expect(resolveKey(IDLE_CHORD, { key: '/' }, 0).action).toEqual({ type: 'focus-search' })
  })

  it('handles g then a letter within the window', () => {
    const first = resolveKey(IDLE_CHORD, { key: 'g' }, 100)

    expect(first.action).toBeNull()
    expect(resolveKey(first.state, { key: 'i' }, 600).action).toEqual({ type: 'go', href: '/invoices' })
  })

  it('drops an expired chord', () => {
    const first = resolveKey(IDLE_CHORD, { key: 'g' }, 0)

    expect(resolveKey(first.state, { key: 'o' }, 5000).action).toBeNull()
  })

  it('ignores modified keys', () => {
    expect(resolveKey(IDLE_CHORD, { key: 'c', metaKey: true }, 0).action).toBeNull()
  })
})

describe('isTypingContext', () => {
  it('blocks inputs, editables, and open dialogs', () => {
    expect(isTypingContext({ tagName: 'INPUT' }, false)).toBe(true)
    expect(isTypingContext({ tagName: 'DIV', isContentEditable: true }, false)).toBe(true)
    expect(isTypingContext({ tagName: 'BODY' }, true)).toBe(true)
    expect(isTypingContext({ tagName: 'BODY' }, false)).toBe(false)
  })
})
