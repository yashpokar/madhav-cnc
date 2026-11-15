// The payment gateway behind billing. Services talk to this interface only, so
// PhonePe can be swapped (or mocked in tests and local development).

import { MockProvider } from '@/lib/billing/mock-provider'
import { PhonePeProvider, phonePeConfigFromEnv } from '@/lib/billing/phonepe'

export type ProviderName = 'PHONEPE' | 'MOCK'

export type CreateOrderInput = {
  /** Our unique order id (the BillingPayment id). Max 63 characters. */
  merchantOrderId: string
  amountPaise: number
  companyId: string
  plan: string
  /** Where the gateway sends the browser back to. */
  returnUrl: string
  message: string
}

export type CreatedOrder = {
  /** The gateway's own order id, when it returns one. */
  providerRef: string | null
  /** Send the browser here to pay. */
  redirectUrl: string
}

export type OrderStatus = {
  state: 'COMPLETED' | 'FAILED' | 'PENDING'
  amountPaise: number
  /** The gateway's order / transaction id. */
  providerPaymentId: string | null
}

export type WebhookEvent =
  | { valid: false; reason: 'auth' | 'body' }
  | {
      valid: true
      /** 'completed' and 'failed' settle an order; anything else is ignored. */
      kind: 'completed' | 'failed' | 'other'
      merchantOrderId: string | null
    }

export interface PaymentProvider {
  readonly name: ProviderName
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>
  /** Asks the gateway (never the browser) what happened to an order. */
  getOrderStatus(merchantOrderId: string): Promise<OrderStatus>
  /** Checks the webhook's credentials and reads which order it is about. */
  verifyWebhook(input: { authorization: string | null; rawBody: string }): WebhookEvent
}

let override: PaymentProvider | null | undefined

/** For tests: force a provider (or null for "not configured"). Pass undefined to reset. */
export function setProviderForTests(provider: PaymentProvider | null | undefined) {
  override = provider
}

/** The configured provider, or null when paid plans are not open yet. */
export function getProvider(): PaymentProvider | null {
  if (override !== undefined) return override

  if (process.env.BILLING_PROVIDER === 'mock') return MockProvider.shared()

  const config = phonePeConfigFromEnv()

  return config ? new PhonePeProvider(config) : null
}

export function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === 'true'
}
