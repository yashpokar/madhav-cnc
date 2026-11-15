// Billing as plain functions (the web actions, the webhook and the API share
// them). Every function takes the company explicitly and filters by it: a
// webhook has no session, so the company is read from our own BillingPayment
// row, never from the request.

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  addYear,
  canIssueInvoice,
  getEntitlements,
  periodStartFor,
  purchaseOutcome,
  type Entitlements,
  type IssueDecision,
} from '@/lib/billing/entitlements'
import { PLANS, isPaidPlan, type BillingPlan } from '@/lib/billing/plans'
import { getProvider, isBillingEnforced } from '@/lib/billing/provider'

type Actor = { id: string; name: string }

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

// ----- reading -------------------------------------------------------------

/** The company's subscription row; a company with none is on FREE and gets the row now. */
export async function getSubscription(companyId: string) {
  const found = await prisma.companySubscription.findUnique({ where: { companyId } })

  if (found) return found

  try {
    return await prisma.companySubscription.create({
      data: { companyId, plan: 'FREE', status: 'ACTIVE', source: 'SELF_SERVE' },
    })
  } catch {
    // Created by someone else a moment ago.
    const again = await prisma.companySubscription.findUnique({ where: { companyId } })

    if (again) return again

    throw new Error('Could not read the subscription')
  }
}

/**
 * Invoices issued by the company, counted once and never decremented.
 * `issuedAt` is stamped by a database trigger on DRAFT -> ISSUED; the status
 * check covers a row from before the trigger existed.
 */
export async function countIssuedInvoices(companyId: string): Promise<number> {
  return prisma.invoice.count({
    where: { companyId, OR: [{ issuedAt: { not: null } }, { status: 'ISSUED' }] },
  })
}

export type BillingSnapshot = {
  plan: BillingPlan
  source: 'SELF_SERVE' | 'GRANDFATHERED' | 'MANUAL'
  entitlements: Entitlements
  decision: IssueDecision
  enforced: boolean
}

export async function getBillingSnapshot(companyId: string, now = new Date()): Promise<BillingSnapshot> {
  const [subscription, issued] = await Promise.all([getSubscription(companyId), countIssuedInvoices(companyId)])
  const entitlements = getEntitlements(subscription, now)
  const enforced = isBillingEnforced()

  return {
    plan: subscription.plan,
    source: subscription.source,
    entitlements,
    decision: canIssueInvoice({ entitlements, issuedCount: issued, enforced }),
    enforced,
  }
}

export function listBillingPayments(companyId: string, take = 20) {
  return prisma.billingPayment.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      plan: true,
      amountPaise: true,
      status: true,
      providerPaymentId: true,
      paidAt: true,
      createdAt: true,
    },
  })
}

// ----- buying --------------------------------------------------------------

function appBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export async function createCheckoutOrder({
  companyId,
  actor,
  plan,
  now = new Date(),
}: {
  companyId: string
  actor: Actor
  plan: string
  now?: Date
}): Promise<Result<{ paymentId: string; redirectUrl: string }>> {
  if (!isPaidPlan(plan)) return fail('Choose a paid plan')

  const provider = getProvider()

  if (!provider) return fail('Paid plans open soon')

  const subscription = await getSubscription(companyId)
  const current = getEntitlements(subscription, now)

  if (PLANS[current.plan].rank > PLANS[plan].rank) {
    return fail(`You are already on ${PLANS[current.plan].name}`)
  }

  if (current.plan === plan && current.renewsOn === null) {
    return fail(`Your ${PLANS[plan].name} plan does not expire`)
  }

  const info = PLANS[plan]
  const start = periodStartFor(subscription, now)
  const id = `bp_${randomUUID().replace(/-/g, '')}`

  await prisma.billingPayment.create({
    data: {
      id,
      companyId,
      plan,
      amountPaise: info.pricePaise,
      currency: 'INR',
      taxPaise: 0,
      status: 'CREATED',
      provider: provider.name,
      providerOrderId: id,
      periodStart: start,
      periodEnd: addYear(start),
      createdById: actor.id,
    },
  })

  try {
    const order = await provider.createOrder({
      merchantOrderId: id,
      amountPaise: info.pricePaise,
      companyId,
      plan,
      returnUrl: `${appBaseUrl()}/settings/billing/return?order=${id}`,
      message: `Prodlys ${info.name} yearly`,
    })

    return { ok: true, paymentId: id, redirectUrl: order.redirectUrl }
  } catch {
    await prisma.billingPayment.updateMany({ where: { id, status: 'CREATED' }, data: { status: 'FAILED' } })

    return fail('We could not start the payment. Please try again.')
  }
}

export type SettleOutcome = 'paid' | 'already-paid' | 'pending' | 'failed' | 'not-found'

/**
 * Brings one order up to date from the gateway. The gateway is asked directly
 * (a redirect query or a webhook body is never trusted), the amount must match
 * what we charged, and the upgrade happens once however often this runs.
 * `companyId`, when given, restricts the lookup (the signed-in company); a
 * webhook omits it and the company comes from the row.
 */
export async function settlePayment(
  merchantOrderId: string,
  opts: { companyId?: string; now?: Date } = {},
): Promise<{ outcome: SettleOutcome; companyId?: string }> {
  const now = opts.now ?? new Date()
  const payment = await prisma.billingPayment.findFirst({
    where: { providerOrderId: merchantOrderId, ...(opts.companyId ? { companyId: opts.companyId } : {}) },
  })

  if (!payment) return { outcome: 'not-found' }

  const { companyId } = payment

  if (payment.status === 'PAID') return { outcome: 'already-paid', companyId }

  const provider = getProvider()

  if (!provider || provider.name !== payment.provider) return { outcome: 'pending', companyId }

  let status

  try {
    status = await provider.getOrderStatus(payment.providerOrderId)
  } catch {
    return { outcome: 'pending', companyId }
  }

  if (status.state === 'PENDING') return { outcome: 'pending', companyId }

  if (status.state === 'FAILED' || status.amountPaise !== payment.amountPaise) {
    await prisma.billingPayment.updateMany({
      where: { id: payment.id, status: 'CREATED' },
      data: { status: 'FAILED' },
    })

    return { outcome: 'failed', companyId }
  }

  const applied = await prisma.$transaction(async (tx) => {
    // Only the first caller flips CREATED -> PAID; a second one changes nothing.
    const flipped = await tx.billingPayment.updateMany({
      where: { id: payment.id, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: now, providerPaymentId: status.providerPaymentId },
    })

    if (flipped.count === 0) return false

    const subscription = await tx.companySubscription.findUnique({ where: { companyId } })

    if (purchaseOutcome(subscription, payment.plan, now) === 'apply') {
      const start = periodStartFor(subscription, now)
      const end = addYear(start)
      const data = {
        plan: payment.plan,
        status: 'ACTIVE' as const,
        source: 'SELF_SERVE' as const,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        graceUntil: null,
      }

      await tx.companySubscription.upsert({
        where: { companyId },
        create: { companyId, ...data },
        update: data,
      })
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: { periodStart: start, periodEnd: end },
      })
    }

    return true
  })

  if (applied) {
    // The trail is a convenience; the upgrade has already been made.
    try {
      await prisma.activityLog.create({
        data: {
          companyId,
          entityType: 'company',
          entityId: companyId,
          action: 'plan-purchased',
          summary: `paid for the ${PLANS[payment.plan].name} plan`,
          userId: payment.createdById,
          userName: 'Billing',
        },
      })
    } catch {
      // ignore
    }
  }

  return { outcome: applied ? 'paid' : 'already-paid', companyId }
}

/** The signed-in company confirms its own order (return page). */
export function confirmPayment({ companyId, merchantOrderId, now }: { companyId: string; merchantOrderId: string; now?: Date }) {
  return settlePayment(merchantOrderId, { companyId, now })
}

/**
 * A gateway webhook. Returns the HTTP status to answer with. Unknown orders
 * and events we do not act on are acknowledged (200) so the gateway stops retrying.
 */
export async function handleWebhook({
  rawBody,
  authorization,
  now,
}: {
  rawBody: string
  authorization: string | null
  now?: Date
}): Promise<{ status: 200 | 400 | 401 }> {
  const provider = getProvider()

  if (!provider) return { status: 401 }

  const event = provider.verifyWebhook({ authorization, rawBody })

  if (!event.valid) return { status: event.reason === 'auth' ? 401 : 400 }

  if (event.kind === 'other' || !event.merchantOrderId) return { status: 200 }

  try {
    await settlePayment(event.merchantOrderId, { now })
  } catch {
    // Let the gateway retry later.
    return { status: 400 }
  }

  return { status: 200 }
}

// ----- platform administrators ---------------------------------------------

export async function setPlanManually({
  actor,
  isSuperAdmin,
  companyId,
  plan,
  reason,
  expiresOn,
}: {
  actor: Actor
  isSuperAdmin: boolean
  companyId: string
  plan: BillingPlan
  reason: string
  expiresOn?: Date | null
}): Promise<Result> {
  if (!isSuperAdmin) return fail('Only a platform administrator can change a plan')

  const why = reason.trim()

  if (why.length < 3) return fail('Give a reason for the change')

  const company = await prisma.companySetting.findUnique({ where: { id: companyId }, select: { id: true } })

  if (!company) return fail('Company not found')

  const data = {
    plan,
    status: 'ACTIVE' as const,
    source: 'MANUAL' as const,
    currentPeriodStart: new Date(),
    currentPeriodEnd: plan === 'FREE' ? null : (expiresOn ?? null),
    graceUntil: null,
  }

  await prisma.$transaction(async (tx) => {
    await tx.companySubscription.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    })
    await tx.activityLog.create({
      data: {
        companyId,
        entityType: 'company',
        entityId: companyId,
        action: 'plan-changed',
        summary: `set the plan to ${PLANS[plan].name}: ${why}`,
        userId: actor.id,
        userName: actor.name,
      },
    })
  })

  return { ok: true }
}
