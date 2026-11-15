// =============================================================================
// VERIFY AGAINST PHONEPE DOCS (https://developer.phonepe.com/) before going live.
//
// Every PhonePe URL, header and field name lives here and nowhere else.
// Checked against the Standard Checkout (v2) API reference pages for
// Authorization, Create Payment, Order Status and Webhooks.
//
// Still unconfirmed by the docs: whether the webhook `Authorization` header is
// hex or has a scheme prefix (we accept hex, with or without a "SHA256 " prefix),
// and whether the create-payment response names the expiry `expireAt` or
// `expiryAt` (we do not read it). Test in the PhonePe sandbox first.
// =============================================================================

export type PhonePeEnv = 'sandbox' | 'production'

export const PHONEPE_BASES: Record<PhonePeEnv, { pg: string; identity: string }> = {
  sandbox: {
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    identity: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    pg: 'https://api.phonepe.com/apis/pg',
    identity: 'https://api.phonepe.com/apis/identity-manager',
  },
}

export const PHONEPE_PATHS = {
  token: '/v1/oauth/token',
  pay: '/checkout/v2/pay',
  status: (merchantOrderId: string) =>
    `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`,
} as const

/** Header scheme for API calls: `Authorization: O-Bearer <token>`. */
export const PHONEPE_AUTH_SCHEME = 'O-Bearer'

/** The payment flow type for the hosted checkout page. */
export const PHONEPE_FLOW_TYPE = 'PG_CHECKOUT'

/** Order lifetime in seconds (docs allow 300 to 3600). */
export const PHONEPE_ORDER_EXPIRY_SECONDS = 1200

/** Webhook event names that settle an order. */
export const PHONEPE_EVENTS = {
  completed: 'checkout.order.completed',
  failed: 'checkout.order.failed',
} as const

/** Refresh the cached token this long before it expires. */
export const PHONEPE_TOKEN_SKEW_SECONDS = 60
