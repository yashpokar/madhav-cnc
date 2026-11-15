import { describe, expect, it } from 'vitest'
import { isWhatsAppSafeToken, newShareToken } from './share-token'

describe('newShareToken', () => {
  it('is 32 characters from a-z and 2-7', () => {
    for (let i = 0; i < 100; i++) {
      expect(newShareToken()).toMatch(/^[a-z2-7]{32}$/)
    }
  })

  it('is unique across 1000 tokens', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newShareToken()))
    expect(tokens.size).toBe(1000)
  })

  it('is WhatsApp safe', () => {
    expect(isWhatsAppSafeToken(newShareToken())).toBe(true)
  })
})

describe('isWhatsAppSafeToken', () => {
  it('accepts letters and digits only', () => {
    expect(isWhatsAppSafeToken('abc123xyz')).toBe(true)
  })

  it('rejects underscores, hyphens, uppercase and empty', () => {
    expect(isWhatsAppSafeToken('abc_def')).toBe(false)
    expect(isWhatsAppSafeToken('abc-def')).toBe(false)
    expect(isWhatsAppSafeToken('Abcdef')).toBe(false)
    expect(isWhatsAppSafeToken('')).toBe(false)
  })
})
