import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** Lowercase base32 (a-z, 2-7) of the bytes, without padding. */
function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }

    value &= (1 << bits) - 1
  }

  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31]
  }

  return out
}

/**
 * A public share token: 160 bits of randomness as 32 lowercase letters and
 * digits. No `_` or `-`, which WhatsApp and some linkifiers mangle.
 */
export function newShareToken(): string {
  return base32(randomBytes(20))
}

/** True when the token has only letters and digits, so it survives WhatsApp. */
export function isWhatsAppSafeToken(token: string): boolean {
  return /^[a-z0-9]+$/.test(token)
}
