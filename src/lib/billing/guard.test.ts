import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError, toApiError } from '@/lib/api/errors'
import { getEntitlements, canIssueInvoice } from '@/lib/billing/entitlements'

const snapshot = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('@/lib/services/billing', () => ({
  getBillingSnapshot: async () => snapshot.value,
}))

import { assertCanIssueInvoice } from '@/lib/billing/guard'

function setup({ used, enforced, paid = false }: { used: number; enforced: boolean; paid?: boolean }) {
  const entitlements = getEntitlements(
    paid ? { plan: 'BUSINESS', status: 'ACTIVE', currentPeriodEnd: null } : null,
    new Date(),
  )

  snapshot.value = {
    entitlements,
    enforced,
    decision: canIssueInvoice({ entitlements, issuedCount: used, enforced }),
  }
}

describe('assertCanIssueInvoice', () => {
  beforeEach(() => setup({ used: 0, enforced: false }))

  it('never blocks while enforcement is off, even past the quota', async () => {
    setup({ used: 50, enforced: false })
    await expect(assertCanIssueInvoice('c1')).resolves.toBeUndefined()
  })

  it('allows up to the quota and blocks the next one when enforced', async () => {
    setup({ used: 9, enforced: true })
    await expect(assertCanIssueInvoice('c1')).resolves.toBeUndefined()

    setup({ used: 10, enforced: true })

    const error = await assertCanIssueInvoice('c1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('PLAN_LIMIT_REACHED')
    expect(toApiError(error).status).toBe(402)
  })

  it('refuses a bulk issue that would cross the quota', async () => {
    setup({ used: 8, enforced: true })
    await expect(assertCanIssueInvoice('c1', 3)).rejects.toBeInstanceOf(DomainError)
    await expect(assertCanIssueInvoice('c1', 2)).resolves.toBeUndefined()
  })

  it('does not limit a paid plan', async () => {
    setup({ used: 900, enforced: true, paid: true })
    await expect(assertCanIssueInvoice('c1')).resolves.toBeUndefined()
  })
})
