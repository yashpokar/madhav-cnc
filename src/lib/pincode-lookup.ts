import { canonicalCity, isValidPincode, normaliseState } from '@/lib/india-geo'

/**
 * Optional pincode -> state/city suggestion.
 *
 * THIRD-PARTY CALL: when enabled, the browser sends the six-digit pincode the
 * user typed to https://api.postalpincode.in (a free public India Post
 * directory). No other data is sent. It is best-effort: any failure, timeout
 * or unexpected answer yields null and the form simply shows nothing.
 *
 * Set this to false to turn the network lookup off entirely; the forms still
 * work and the state is still guessed locally from the pincode where the
 * postal circle is unambiguous.
 */
export const ENABLE_PINCODE_LOOKUP = true

export const PINCODE_LOOKUP_TIMEOUT_MS = 3000

export type PincodeSuggestion = { state: string; city: string }

type PostOffice = { District?: unknown; Block?: unknown; State?: unknown }

/** Reads the postalpincode.in response. Exported for tests. */
export function parsePincodeResponse(body: unknown): PincodeSuggestion | null {
  const first = Array.isArray(body) ? body[0] : null
  if (!first || typeof first !== 'object') return null

  const result = first as { Status?: unknown; PostOffice?: unknown }
  if (result.Status !== 'Success' || !Array.isArray(result.PostOffice)) return null

  const office = (result.PostOffice as PostOffice[]).find(
    (candidate) => typeof candidate?.State === 'string',
  )
  if (!office) return null

  const state = normaliseState(String(office.State))
  if (!state) return null

  const district = typeof office.District === 'string' ? office.District.trim() : ''
  const city = canonicalCity(state.name, district) ?? district
  if (!city) return null

  return { state: state.name, city }
}

/** Resolves to null on any problem, including a caller abort or timeout. */
export async function lookupPincode(
  pincode: string,
  signal?: AbortSignal,
): Promise<PincodeSuggestion | null> {
  if (!ENABLE_PINCODE_LOOKUP || !isValidPincode(pincode)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PINCODE_LOOKUP_TIMEOUT_MS)
  const forward = () => controller.abort()
  signal?.addEventListener('abort', forward)

  try {
    const response = await fetch(
      `https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`,
      { signal: controller.signal },
    )
    if (!response.ok) return null

    return parsePincodeResponse(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}
