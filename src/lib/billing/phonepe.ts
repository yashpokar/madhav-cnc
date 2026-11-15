// PhonePe PG "Standard Checkout" (OAuth v2) over plain fetch: no SDK.
// Every URL and field name comes from phonepe-constants.ts.
// Secrets are never logged and never put in an error message.

import { createHash, timingSafeEqual } from 'node:crypto'
import {
  PHONEPE_AUTH_SCHEME,
  PHONEPE_BASES,
  PHONEPE_EVENTS,
  PHONEPE_FLOW_TYPE,
  PHONEPE_ORDER_EXPIRY_SECONDS,
  PHONEPE_PATHS,
  PHONEPE_TOKEN_SKEW_SECONDS,
  type PhonePeEnv,
} from '@/lib/billing/phonepe-constants'
import type {
  CreateOrderInput,
  CreatedOrder,
  OrderStatus,
  PaymentProvider,
  WebhookEvent,
} from '@/lib/billing/provider'

export type PhonePeConfig = {
  clientId: string
  clientSecret: string
  clientVersion: string
  env: PhonePeEnv
  webhookUsername: string
  webhookPassword: string
}

export function phonePeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PhonePeConfig | null {
  const clientId = env.PHONEPE_CLIENT_ID
  const clientSecret = env.PHONEPE_CLIENT_SECRET
  const clientVersion = env.PHONEPE_CLIENT_VERSION

  if (!clientId || !clientSecret || !clientVersion) return null

  return {
    clientId,
    clientSecret,
    clientVersion,
    env: env.PHONEPE_ENV === 'production' ? 'production' : 'sandbox',
    webhookUsername: env.PHONEPE_WEBHOOK_USERNAME ?? '',
    webhookPassword: env.PHONEPE_WEBHOOK_PASSWORD ?? '',
  }
}

type Fetch = typeof fetch

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}

export class PhonePeProvider implements PaymentProvider {
  readonly name = 'PHONEPE' as const
  private token: { value: string; expiresAtMs: number } | null = null

  constructor(
    private readonly config: PhonePeConfig,
    /** The HTTP transport; replaced in tests. */
    private readonly http: Fetch = (...args) => fetch(...args),
    private readonly now: () => number = () => Date.now(),
  ) {}

  private get bases() {
    return PHONEPE_BASES[this.config.env]
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAtMs - PHONEPE_TOKEN_SKEW_SECONDS * 1000 > this.now()) {
      return this.token.value
    }

    const response = await this.http(`${this.bases.identity}${PHONEPE_PATHS.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_version: this.config.clientVersion,
        client_secret: this.config.clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    })

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_at?: number
    }

    if (!response.ok || !body.access_token) {
      throw new Error(`PhonePe sign-in failed (HTTP ${response.status})`)
    }

    // expires_at is epoch seconds; tolerate milliseconds.
    const raw = Number(body.expires_at ?? 0)
    const expiresAtMs = raw > 1e12 ? raw : raw * 1000

    this.token = { value: body.access_token, expiresAtMs: expiresAtMs || this.now() + 5 * 60_000 }

    return this.token.value
  }

  private async call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    const token = await this.accessToken()
    const response = await this.http(`${this.bases.pg}${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${PHONEPE_AUTH_SCHEME} ${token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })

    const body = (await response.json().catch(() => ({}))) as T & { code?: string }

    if (!response.ok) {
      throw new Error(`PhonePe request failed (HTTP ${response.status}${body.code ? `, ${body.code}` : ''})`)
    }

    return body
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = await this.call<{ orderId?: string; redirectUrl?: string }>(PHONEPE_PATHS.pay, {
      method: 'POST',
      body: {
        merchantOrderId: input.merchantOrderId,
        amount: input.amountPaise,
        expireAfter: PHONEPE_ORDER_EXPIRY_SECONDS,
        metaInfo: { udf1: input.companyId, udf2: input.plan },
        paymentFlow: {
          type: PHONEPE_FLOW_TYPE,
          message: input.message,
          merchantUrls: { redirectUrl: input.returnUrl },
        },
      },
    })

    if (!body.redirectUrl) throw new Error('PhonePe did not return a payment page')

    return { providerRef: body.orderId ?? null, redirectUrl: body.redirectUrl }
  }

  async getOrderStatus(merchantOrderId: string): Promise<OrderStatus> {
    const body = await this.call<{ state?: string; amount?: number | string; orderId?: string }>(
      PHONEPE_PATHS.status(merchantOrderId),
      { method: 'GET' },
    )

    const state = body.state === 'COMPLETED' || body.state === 'FAILED' ? body.state : 'PENDING'

    return {
      state,
      amountPaise: Number(body.amount ?? 0),
      providerPaymentId: body.orderId ?? null,
    }
  }

  verifyWebhook({ authorization, rawBody }: { authorization: string | null; rawBody: string }): WebhookEvent {
    const { webhookUsername, webhookPassword } = this.config

    // Without credentials configured, no webhook can be trusted.
    if (!webhookUsername || !webhookPassword || !authorization) return { valid: false, reason: 'auth' }

    const expected = sha256Hex(`${webhookUsername}:${webhookPassword}`)
    const given = authorization.trim().replace(/^sha256[\s=:]*/i, '').toLowerCase()

    if (!safeEqual(given, expected)) return { valid: false, reason: 'auth' }

    try {
      const body = JSON.parse(rawBody) as {
        event?: string
        payload?: { merchantOrderId?: string }
      }

      const kind =
        body.event === PHONEPE_EVENTS.completed
          ? 'completed'
          : body.event === PHONEPE_EVENTS.failed
            ? 'failed'
            : 'other'

      const id = body.payload?.merchantOrderId

      return { valid: true, kind, merchantOrderId: typeof id === 'string' ? id : null }
    } catch {
      return { valid: false, reason: 'body' }
    }
  }
}
