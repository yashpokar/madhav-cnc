// A stand-in gateway for tests and local development (BILLING_PROVIDER=mock).
// Orders live in memory; the "payment page" is our own return URL.

import { createHash, timingSafeEqual } from 'node:crypto'
import type {
  CreateOrderInput,
  CreatedOrder,
  OrderStatus,
  PaymentProvider,
  WebhookEvent,
} from '@/lib/billing/provider'

type MockOrder = { amountPaise: number; state: OrderStatus['state']; ref: string }

const globalForMock = globalThis as unknown as { __mockBilling?: MockProvider }

export const MOCK_WEBHOOK_AUTH = createHash('sha256').update('mock:mock').digest('hex')

export class MockProvider implements PaymentProvider {
  readonly name = 'MOCK' as const
  private orders = new Map<string, MockOrder>()

  /** One instance per process, so a dev server and its actions share orders. */
  static shared(): MockProvider {
    globalForMock.__mockBilling ??= new MockProvider()

    return globalForMock.__mockBilling
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const ref = `MOCK_${input.merchantOrderId}`

    // The mock "pays" at once; tests change it with setState.
    this.orders.set(input.merchantOrderId, {
      amountPaise: input.amountPaise,
      state: 'COMPLETED',
      ref,
    })

    return { providerRef: ref, redirectUrl: input.returnUrl }
  }

  async getOrderStatus(merchantOrderId: string): Promise<OrderStatus> {
    const order = this.orders.get(merchantOrderId)

    if (!order) throw new Error('Unknown order')

    return {
      state: order.state,
      amountPaise: order.amountPaise,
      providerPaymentId: order.state === 'COMPLETED' ? order.ref : null,
    }
  }

  verifyWebhook({ authorization, rawBody }: { authorization: string | null; rawBody: string }): WebhookEvent {
    const given = Buffer.from(authorization ?? '')
    const expected = Buffer.from(MOCK_WEBHOOK_AUTH)

    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return { valid: false, reason: 'auth' }
    }

    try {
      const body = JSON.parse(rawBody) as { event?: string; payload?: { merchantOrderId?: string } }
      const kind =
        body.event === 'checkout.order.completed'
          ? 'completed'
          : body.event === 'checkout.order.failed'
            ? 'failed'
            : 'other'

      return { valid: true, kind, merchantOrderId: body.payload?.merchantOrderId ?? null }
    } catch {
      return { valid: false, reason: 'body' }
    }
  }

  /** Test hook: change what the gateway reports for an order. */
  setState(merchantOrderId: string, state: OrderStatus['state'], amountPaise?: number) {
    const order = this.orders.get(merchantOrderId)

    if (order) this.orders.set(merchantOrderId, { ...order, state, amountPaise: amountPaise ?? order.amountPaise })
  }
}
