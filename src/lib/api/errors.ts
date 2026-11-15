/** Every error the mobile API can return, with its HTTP status. */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  ACCOUNT_DEACTIVATED: 403,
  FORBIDDEN: 403,
  COMPANY_REQUIRED: 400,
  COMPANY_NOT_ACCESSIBLE: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  UPGRADE_REQUIRED: 426,
  /** The company has used its free invoices and is not on a paid plan (billing). */
  PLAN_LIMIT_REACHED: 402,
  INTERNAL: 500,
} as const

export type ApiErrorCode = keyof typeof ERROR_STATUS

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  /** Field name -> message, for VALIDATION_FAILED. */
  readonly fields?: Record<string, string>
  /** Seconds, for RATE_LIMITED. */
  readonly retryAfter?: number

  constructor(
    code: ApiErrorCode,
    message: string,
    extra: { fields?: Record<string, string>; retryAfter?: number } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.fields = extra.fields
    this.retryAfter = extra.retryAfter
  }
}

/**
 * A business-rule refusal from a service (`{ ok: false, error }`): the
 * message is already written for a person, so it is passed through with the
 * code the caller picks (CONFLICT unless it says otherwise).
 */
export class DomainError extends Error {
  readonly code: ApiErrorCode
  readonly fields?: Record<string, string>

  constructor(message: string, code: ApiErrorCode = 'CONFLICT', fields?: Record<string, string>) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.fields = fields
  }
}

/** Turns any thrown value into the ApiError the client will see. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof DomainError) {
    return new ApiError(error.code, error.message, { fields: error.fields })
  }

  // Never leak internals (SQL, stack traces, file paths) to a phone.
  return new ApiError('INTERNAL', 'Something went wrong. Please try again.')
}

/** Unwraps a service result, throwing a DomainError for `{ ok: false }`. */
export function unwrapService<T extends { ok: boolean }>(
  result: T,
  code: ApiErrorCode = 'CONFLICT',
): Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new DomainError((result as unknown as { error: string }).error, code)
  }

  return result as Extract<T, { ok: true }>
}
