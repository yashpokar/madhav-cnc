import { ApiError } from '@/lib/api/errors'

/**
 * Fixed-window request limiter for the mobile API, keyed by user id (or by
 * client address for calls that are not signed in).
 *
 * LIMITATION: the counters live in this process's memory. That is exact for a
 * single replica (what runs today). With more than one replica each one counts
 * on its own, so the real ceiling becomes limit x replicas, and a restart
 * clears the counters. Before scaling out, implement `RateLimitStore` on a
 * shared store (Redis is the natural fit; a Postgres table also works but adds
 * a write to every request) and pass it to `setRateLimitStore`.
 */
export type RateClass = 'default' | 'write' | 'upload' | 'anonymous'

export const RATE_LIMITS: Record<RateClass, { limit: number; windowMs: number }> = {
  default: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 60_000 },
  anonymous: { limit: 60, windowMs: 60_000 },
}

export type RateResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }

export interface RateLimitStore {
  /** Counts one hit against `key` for the window and says whether it is within `limit`. */
  hit(key: string, limit: number, windowMs: number, now: number): Promise<RateResult>
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { start: number; count: number }>()
  private lastSweep = 0

  async hit(key: string, limit: number, windowMs: number, now: number): Promise<RateResult> {
    this.sweep(now, windowMs)

    let window = this.windows.get(key)

    if (!window || now - window.start >= windowMs) {
      window = { start: now, count: 0 }
      this.windows.set(key, window)
    }

    window.count += 1

    const retryAfterSeconds = Math.ceil((window.start + windowMs - now) / 1000)

    return {
      allowed: window.count <= limit,
      remaining: Math.max(0, limit - window.count),
      retryAfterSeconds,
    }
  }

  /** Drops expired windows now and then so the map can not grow without bound. */
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < windowMs) return

    this.lastSweep = now

    for (const [key, window] of this.windows) {
      if (now - window.start >= windowMs) this.windows.delete(key)
    }
  }
}

let store: RateLimitStore = new MemoryRateLimitStore()

export function setRateLimitStore(next: RateLimitStore) {
  store = next
}

/** Which bucket a request counts against. */
export function rateClassFor(method: string, upload = false): RateClass {
  if (upload) return 'upload'

  return method === 'GET' || method === 'HEAD' ? 'default' : 'write'
}

/** The caller's address behind Cloudflare, for requests that are not signed in. */
export function clientAddress(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/** Throws RATE_LIMITED (429 with Retry-After) when the caller is over the limit. */
export async function enforceRateLimit(
  subject: string,
  rateClass: RateClass,
  now = Date.now(),
  using: RateLimitStore = store,
): Promise<void> {
  const { limit, windowMs } = RATE_LIMITS[rateClass]
  const result = await using.hit(`${rateClass}:${subject}`, limit, windowMs, now)

  if (!result.allowed) {
    throw new ApiError('RATE_LIMITED', 'Too many requests. Please slow down.', {
      retryAfter: result.retryAfterSeconds,
    })
  }
}
