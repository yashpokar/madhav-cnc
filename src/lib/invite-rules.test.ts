import { describe, expect, it } from 'vitest'
import { UserRole } from '@/generated/prisma/enums'
import { newShareToken } from './share-token'
import {
  INVITE_VALID_DAYS,
  MAX_INVITES_PER_HOUR,
  MAX_PENDING_INVITES,
  ROLE_BLURBS,
  canTransition,
  checkInviteLimits,
  checkInviteRole,
  cleanHint,
  describeUnusable,
  effectiveStatus,
  emailDiffers,
  expiryFrom,
  firstName,
  inviteMessage,
  inviteUrl,
  isAcceptable,
  isPlausibleToken,
} from './invite-rules'

const now = new Date('2026-11-15T10:00:00Z')

describe('checkInviteRole', () => {
  it('lets only an administrator invite, for any role', () => {
    for (const role of Object.values(UserRole)) {
      expect(checkInviteRole('ADMIN', role).ok).toBe(true)
    }
  })

  it('refuses everyone else, ADMIN above all', () => {
    for (const inviter of Object.values(UserRole).filter((r) => r !== 'ADMIN')) {
      expect(checkInviteRole(inviter, 'ADMIN').ok).toBe(false)
      expect(checkInviteRole(inviter, 'VIEWER').ok).toBe(false)
    }
  })

  it('refuses an unknown role', () => {
    expect(checkInviteRole('ADMIN', 'OWNER')).toEqual({ ok: false, error: 'Unknown role' })
  })

  it('describes every role', () => {
    for (const role of Object.values(UserRole)) expect(ROLE_BLURBS[role].length).toBeGreaterThan(10)
  })
})

describe('checkInviteLimits', () => {
  it('stops at the pending cap and the hourly cap', () => {
    expect(checkInviteLimits({ pending: MAX_PENDING_INVITES - 1, createdLastHour: 0 }).ok).toBe(true)
    expect(checkInviteLimits({ pending: MAX_PENDING_INVITES, createdLastHour: 0 }).ok).toBe(false)
    expect(checkInviteLimits({ pending: 0, createdLastHour: MAX_INVITES_PER_HOUR - 1 }).ok).toBe(true)
    expect(checkInviteLimits({ pending: 0, createdLastHour: MAX_INVITES_PER_HOUR }).ok).toBe(false)
  })
})

describe('expiry and status', () => {
  it('expires after the validity window', () => {
    expect(expiryFrom(now).getTime() - now.getTime()).toBe(INVITE_VALID_DAYS * 86_400_000)
  })

  it('reads a lapsed pending invitation as expired, and only that', () => {
    const past = new Date(now.getTime() - 1)

    expect(effectiveStatus({ status: 'PENDING', expiresAt: past }, now)).toBe('EXPIRED')
    expect(effectiveStatus({ status: 'PENDING', expiresAt: now }, now)).toBe('EXPIRED')
    expect(effectiveStatus({ status: 'PENDING', expiresAt: expiryFrom(now) }, now)).toBe('PENDING')
    expect(effectiveStatus({ status: 'ACCEPTED', expiresAt: past }, now)).toBe('ACCEPTED')
    expect(effectiveStatus({ status: 'REVOKED', expiresAt: past }, now)).toBe('REVOKED')
  })

  it('accepts only a live pending invitation', () => {
    const future = expiryFrom(now)

    expect(isAcceptable({ status: 'PENDING', expiresAt: future }, now)).toBe(true)
    expect(isAcceptable({ status: 'ACCEPTED', expiresAt: future }, now)).toBe(false)
    expect(isAcceptable({ status: 'REVOKED', expiresAt: future }, now)).toBe(false)
    expect(isAcceptable({ status: 'PENDING', expiresAt: now }, now)).toBe(false)
  })

  it('moves through the allowed transitions only', () => {
    expect(canTransition('PENDING', 'ACCEPTED')).toBe(true)
    expect(canTransition('PENDING', 'REVOKED')).toBe(true)
    expect(canTransition('ACCEPTED', 'PENDING')).toBe(false)
    expect(canTransition('REVOKED', 'ACCEPTED')).toBe(false)
    expect(canTransition('EXPIRED', 'ACCEPTED')).toBe(false)
  })

  it('does not reveal why a link is unusable, except that it was used', () => {
    expect(describeUnusable('REVOKED')).toBe(describeUnusable('EXPIRED'))
    expect(describeUnusable('ACCEPTED')).toContain('already been used')
  })
})

describe('tokens and urls', () => {
  it('recognises our tokens only', () => {
    expect(isPlausibleToken(newShareToken())).toBe(true)
    expect(isPlausibleToken('short')).toBe(false)
    expect(isPlausibleToken('A'.repeat(32))).toBe(false)
    expect(isPlausibleToken(undefined)).toBe(false)
  })

  it('builds the link with or without a trailing slash', () => {
    expect(inviteUrl('https://app.example.com/', 'abc')).toBe('https://app.example.com/join/abc')
    expect(inviteUrl('https://app.example.com', 'abc')).toBe('https://app.example.com/join/abc')
    expect(inviteUrl(null, 'abc')).toBe('/join/abc')
  })
})

describe('message', () => {
  it('puts the link alone on the last line', () => {
    const url = 'https://app.example.com/join/abc'
    const text = inviteMessage({ inviter: 'Asha Patel', company: 'Studio One', role: 'SALES', url })

    expect(text).toBe(`Asha invited you to join Studio One on Prodlys as Sales. Tap to join:\n${url}`)
    expect(text.split('\n').at(-1)).toBe(url)
  })

  it('falls back when there is no name', () => {
    expect(firstName('  ')).toBe('Someone')
    expect(firstName('Ravi Kumar')).toBe('Ravi')
  })
})

describe('email hint', () => {
  it('lowercases and drops empty hints', () => {
    expect(cleanHint('  Foo@Bar.com ')).toBe('foo@bar.com')
    expect(cleanHint('  ')).toBeNull()
  })

  it('flags only a real difference', () => {
    expect(emailDiffers(null, 'a@b.com')).toBe(false)
    expect(emailDiffers('A@B.com', 'a@b.com')).toBe(false)
    expect(emailDiffers('x@b.com', 'a@b.com')).toBe(true)
  })
})
