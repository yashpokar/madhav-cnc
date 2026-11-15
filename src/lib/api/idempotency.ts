import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api/errors'

/** How long a stored response may be replayed. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

const KEY_FORMAT = /^[A-Za-z0-9._:-]{8,128}$/

export function parseIdempotencyKey(raw: string | null): string | null {
  if (raw === null) return null

  if (!KEY_FORMAT.test(raw)) {
    throw new ApiError('VALIDATION_FAILED', 'Idempotency-Key must be 8-128 letters, digits or . _ : -', {
      fields: { 'Idempotency-Key': 'Invalid format' },
    })
  }

  return raw
}

/** Same method + path + body gives the same hash; anything else differs. */
export function hashRequest(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex')
}

export type StoredResponse = { status: number; body: unknown }

export type IdempotencyRow = {
  id: string
  requestHash: string
  responseStatus: number
  responseBody: unknown
  createdAt: Date
}

export type IdempotencyScope = {
  userId: string
  /** "" for account-level calls with no company. */
  companyId: string
  key: string
}

/** Where reservations live. The Prisma one is below; tests use an in-memory one. */
export interface IdempotencyStore {
  /** Inserts a pending row; returns null when the (user, company, key) row already exists. */
  reserve(scope: IdempotencyScope, request: { method: string; path: string; requestHash: string }, now: Date): Promise<string | null>
  find(scope: IdempotencyScope): Promise<IdempotencyRow | null>
  complete(id: string, response: StoredResponse): Promise<void>
  release(id: string): Promise<void>
  deleteExpired(before: Date): Promise<number>
}

export type IdempotentOutcome = StoredResponse & { replayed: boolean }

/**
 * Reserve-then-run. The first request reserves the key (a unique insert, so
 * two racing requests can not both run), runs, and stores a successful (2xx)
 * response. A retry with the same key and the same request gets that stored
 * response back. The same key with a different request is refused. A request
 * that fails is not remembered (its reservation is released), so the client
 * may retry it with the same key. A retry that arrives while the first is
 * still running gets 409 CONFLICT.
 */
export async function runIdempotent(
  store: IdempotencyStore,
  scope: IdempotencyScope,
  request: { method: string; path: string; requestHash: string },
  run: () => Promise<StoredResponse>,
  now = new Date(),
): Promise<IdempotentOutcome> {
  let reservation = await store.reserve(scope, request, now)

  if (reservation === null) {
    const existing = await store.find(scope)

    if (existing && now.getTime() - existing.createdAt.getTime() >= IDEMPOTENCY_TTL_MS) {
      // Too old to replay: forget it and treat this as a fresh request.
      await store.release(existing.id)
      reservation = await store.reserve(scope, request, now)
    } else if (existing) {
      if (existing.requestHash !== request.requestHash) {
        throw new ApiError(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used for a different request.',
        )
      }

      if (existing.responseStatus === 0) {
        throw new ApiError('CONFLICT', 'The original request is still being processed. Retry shortly.')
      }

      return { status: existing.responseStatus, body: existing.responseBody, replayed: true }
    }

    if (reservation === null) {
      throw new ApiError('CONFLICT', 'The original request is still being processed. Retry shortly.')
    }
  }

  let response: StoredResponse

  try {
    response = await run()
  } catch (error) {
    await store.release(reservation).catch(() => {})
    throw error
  }

  if (response.status >= 200 && response.status < 300) {
    await store.complete(reservation, response)
  } else {
    await store.release(reservation).catch(() => {})
  }

  return { ...response, replayed: false }
}

/** Run from a scheduled job (or opportunistically): removes rows past the TTL. */
export async function cleanupIdempotencyKeys(store: IdempotencyStore, now = new Date()): Promise<number> {
  return store.deleteExpired(new Date(now.getTime() - IDEMPOTENCY_TTL_MS))
}

/** In-memory store, for tests. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly rows = new Map<string, IdempotencyRow & { scopeKey: string }>()
  private seq = 0

  private scopeKey(s: IdempotencyScope) {
    return `${s.userId}|${s.companyId}|${s.key}`
  }

  async reserve(scope: IdempotencyScope, request: { requestHash: string }, now: Date) {
    const scopeKey = this.scopeKey(scope)

    if ([...this.rows.values()].some((r) => r.scopeKey === scopeKey)) return null

    const id = `row${++this.seq}`

    this.rows.set(id, {
      id,
      scopeKey,
      requestHash: request.requestHash,
      responseStatus: 0,
      responseBody: null,
      createdAt: now,
    })

    return id
  }

  async find(scope: IdempotencyScope) {
    const scopeKey = this.scopeKey(scope)

    return [...this.rows.values()].find((r) => r.scopeKey === scopeKey) ?? null
  }

  async complete(id: string, response: StoredResponse) {
    const row = this.rows.get(id)

    if (row) {
      row.responseStatus = response.status
      row.responseBody = response.body
    }
  }

  async release(id: string) {
    this.rows.delete(id)
  }

  async deleteExpired(before: Date) {
    let count = 0

    for (const [id, row] of this.rows) {
      if (row.createdAt < before) {
        this.rows.delete(id)
        count += 1
      }
    }

    return count
  }
}
