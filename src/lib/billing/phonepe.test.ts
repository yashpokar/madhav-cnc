import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PhonePeProvider, phonePeConfigFromEnv, safeEqual, type PhonePeConfig } from '@/lib/billing/phonepe'

const config: PhonePeConfig = {
  clientId: 'CID',
  clientSecret: 'SECRET',
  clientVersion: '1',
  env: 'sandbox',
  webhookUsername: 'hook-user',
  webhookPassword: 'hook-pass',
}

const hex = (v: string) => createHash('sha256').update(v).digest('hex')

type Call = { url: string; init: RequestInit }

function transport(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = []
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift() ?? { body: {} }

    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 })
  }) as unknown as typeof fetch

  return { calls, http }
}

const token = { access_token: 'tok-1', expires_at: 2_000_000_000 }

describe('PhonePeProvider requests', () => {
  it('signs in with form fields and caches the token until near expiry', async () => {
    const { calls, http } = transport([
      { body: token },
      { body: { orderId: 'OMO1', state: 'PENDING', redirectUrl: 'https://pay.example/1' } },
      { body: { orderId: 'OMO2', state: 'PENDING', redirectUrl: 'https://pay.example/2' } },
    ])
    const provider = new PhonePeProvider(config, http, () => 1_900_000_000_000)
    const input = {
      merchantOrderId: 'bp_abc',
      amountPaise: 39_900,
      companyId: 'c1',
      plan: 'BUSINESS',
      returnUrl: 'https://app.prodlys.com/settings/billing/return?order=bp_abc',
      message: 'Prodlys Business yearly',
    }

    const order = await provider.createOrder(input)

    expect(order).toEqual({ providerRef: 'OMO1', redirectUrl: 'https://pay.example/1' })
    await provider.createOrder({ ...input, merchantOrderId: 'bp_def' })

    // One sign-in, two payments.
    expect(calls.filter((c) => c.url.endsWith('/v1/oauth/token'))).toHaveLength(1)

    const signIn = calls[0]

    expect(signIn.url).toBe('https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token')
    expect(new URLSearchParams(String(signIn.init.body)).get('grant_type')).toBe('client_credentials')
    expect(new URLSearchParams(String(signIn.init.body)).get('client_id')).toBe('CID')

    const pay = calls[1]

    expect(pay.url).toBe('https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay')
    expect((pay.init.headers as Record<string, string>).Authorization).toBe('O-Bearer tok-1')
    expect(JSON.parse(String(pay.init.body))).toEqual({
      merchantOrderId: 'bp_abc',
      amount: 39_900,
      expireAfter: 1200,
      metaInfo: { udf1: 'c1', udf2: 'BUSINESS' },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: 'Prodlys Business yearly',
        merchantUrls: { redirectUrl: input.returnUrl },
      },
    })
  })

  it('refreshes an expiring token', async () => {
    const { calls, http } = transport([
      { body: { access_token: 'a', expires_at: 1_000_000_030 } },
      { body: { state: 'COMPLETED', amount: 100 } },
      { body: { access_token: 'b', expires_at: 2_000_000_000 } },
      { body: { state: 'COMPLETED', amount: 100 } },
    ])
    const provider = new PhonePeProvider(config, http, () => 1_000_000_000_000)

    await provider.getOrderStatus('x')
    await provider.getOrderStatus('x')
    expect(calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(2)
  })

  it('reads the order status from the status API', async () => {
    const { calls, http } = transport([
      { body: token },
      { body: { orderId: 'OMO9', state: 'COMPLETED', amount: 39_900 } },
    ])
    const provider = new PhonePeProvider({ ...config, env: 'production' }, http, () => 1_900_000_000_000)

    await expect(provider.getOrderStatus('bp_abc')).resolves.toEqual({
      state: 'COMPLETED',
      amountPaise: 39_900,
      providerPaymentId: 'OMO9',
    })
    expect(calls[0].url).toBe('https://api.phonepe.com/apis/identity-manager/v1/oauth/token')
    expect(calls[1].url).toBe('https://api.phonepe.com/apis/pg/checkout/v2/order/bp_abc/status?details=false')
  })

  it('maps unknown states to PENDING and errors without leaking secrets', async () => {
    const a = transport([{ body: token }, { body: { state: 'WHATEVER', amount: '10' } }])

    await expect(new PhonePeProvider(config, a.http, () => 1_900_000_000_000).getOrderStatus('x')).resolves.toMatchObject({
      state: 'PENDING',
      amountPaise: 10,
    })

    const b = transport([{ body: token }, { status: 400, body: { code: 'BAD_REQUEST', message: 'secret SECRET' } }])
    const error = await new PhonePeProvider(config, b.http, () => 1_900_000_000_000)
      .getOrderStatus('x')
      .catch((e: Error) => e)

    expect((error as Error).message).toBe('PhonePe request failed (HTTP 400, BAD_REQUEST)')
    expect((error as Error).message).not.toContain('SECRET')
  })
})

describe('PhonePe webhook verification', () => {
  const provider = new PhonePeProvider(config, transport([]).http)
  const body = JSON.stringify({
    event: 'checkout.order.completed',
    payload: { orderId: 'OMO1', merchantOrderId: 'bp_abc', state: 'COMPLETED', amount: 39_900 },
  })
  const good = hex('hook-user:hook-pass')

  it('accepts the right credentials hash and reads the merchant order id', () => {
    expect(provider.verifyWebhook({ authorization: good, rawBody: body })).toEqual({
      valid: true,
      kind: 'completed',
      merchantOrderId: 'bp_abc',
    })
    expect(provider.verifyWebhook({ authorization: `SHA256 ${good}`, rawBody: body })).toMatchObject({ valid: true })
  })

  it('rejects a wrong, missing or differently sized header', () => {
    for (const authorization of [hex('hook-user:nope'), '', null, 'abc']) {
      expect(provider.verifyWebhook({ authorization, rawBody: body })).toEqual({ valid: false, reason: 'auth' })
    }
  })

  it('rejects everything when webhook credentials are not configured', () => {
    const open = new PhonePeProvider({ ...config, webhookUsername: '', webhookPassword: '' }, transport([]).http)

    expect(open.verifyWebhook({ authorization: hex(':'), rawBody: body })).toEqual({ valid: false, reason: 'auth' })
  })

  it('reports a bad body and ignores other events', () => {
    expect(provider.verifyWebhook({ authorization: good, rawBody: '{nope' })).toEqual({ valid: false, reason: 'body' })
    expect(
      provider.verifyWebhook({ authorization: good, rawBody: JSON.stringify({ event: 'pg.refund.completed', payload: {} }) }),
    ).toEqual({ valid: true, kind: 'other', merchantOrderId: null })
  })

  it('compares in constant time and handles unequal lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('phonePeConfigFromEnv', () => {
  it('is null until the client credentials are set, and defaults to sandbox', () => {
    expect(phonePeConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull()

    const env = {
      PHONEPE_CLIENT_ID: 'a',
      PHONEPE_CLIENT_SECRET: 'b',
      PHONEPE_CLIENT_VERSION: '1',
    } as unknown as NodeJS.ProcessEnv

    expect(phonePeConfigFromEnv(env)?.env).toBe('sandbox')
    expect(phonePeConfigFromEnv({ ...env, PHONEPE_ENV: 'production' } as NodeJS.ProcessEnv)?.env).toBe('production')
  })
})
