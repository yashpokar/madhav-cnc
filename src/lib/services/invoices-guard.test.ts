import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from '@/lib/api/errors'

// The billing guard wired into the invoice services, against a small in-memory
// prisma: the real guard, the real billing snapshot and the real issue rules.
// Only DRAFT -> ISSUED (and a create-as-ISSUED) is guarded; BILLING_ENFORCED
// switches the whole thing on.

type Row = {
  id: string
  status: 'DRAFT' | 'ISSUED' | 'CANCELLED'
  issuedAt: Date | null
}

const db = vi.hoisted(() => ({
  invoices: [] as Row[],
  subscription: null as null | { plan: string; status: string; currentPeriodEnd: Date | null; source: string },
  updated: [] as string[],
}))

vi.mock('@/lib/active-company', () => ({ requireCompanyId: async () => 'co1' }))
vi.mock('@/lib/activity', () => ({ logActivity: async () => {} }))
vi.mock('@/lib/codes', () => ({ nextInvoiceNumber: async () => 'INV-X', nextPaymentNumber: async () => 'PAY-X' }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companySubscription: {
      findUnique: async () => db.subscription,
      create: async () => db.subscription,
    },
    customer: { findUnique: async () => ({ id: 'cu1' }) },
    invoice: {
      // The same condition as countIssuedInvoices: issued once (issuedAt) or issued now.
      count: async () => db.invoices.filter((row) => row.issuedAt !== null || row.status === 'ISSUED').length,
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = db.invoices.find((invoice) => invoice.id === where.id)

        return row ? { ...row, number: row.id, _count: { paymentAllocations: 0 } } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: Row['status'] } }) => {
        const row = db.invoices.find((invoice) => invoice.id === where.id)!

        row.status = data.status

        // The database trigger: stamped on DRAFT -> ISSUED, never cleared.
        if (data.status === 'ISSUED') row.issuedAt ??= new Date()

        db.updated.push(`${where.id}:${data.status}`)

        return row
      },
      create: async ({ data }: { data: { status: Row['status'] } }) => {
        const row: Row = { id: `new${db.invoices.length}`, status: data.status, issuedAt: data.status === 'ISSUED' ? new Date() : null }

        db.invoices.push(row)

        return { ...row, number: 'INV-X' }
      },
    },
  },
}))

import { changeInvoiceStatus, createInvoice } from '@/lib/services/invoices'
import { invoiceInputSchema } from '@/lib/validation/invoices'

const actor = { id: 'u1', name: 'U' }

function issued(count: number) {
  db.invoices = Array.from({ length: count }, (_, i) => ({ id: `i${i}`, status: 'ISSUED' as const, issuedAt: new Date() }))
}

const draft = (id = 'draft1', issuedAt: Date | null = null): Row => ({ id, status: 'DRAFT', issuedAt })

const free = { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, source: 'SELF_SERVE' }
const business = { plan: 'BUSINESS', status: 'ACTIVE', currentPeriodEnd: null, source: 'SELF_SERVE' }
const grandfathered = { plan: 'BUSINESS', status: 'ACTIVE', currentPeriodEnd: null, source: 'GRANDFATHERED' }

beforeEach(() => {
  db.invoices = []
  db.subscription = free
  db.updated = []
  process.env.BILLING_ENFORCED = 'true'
})

afterEach(() => {
  delete process.env.BILLING_ENFORCED
})

const issue = (id: string) => changeInvoiceStatus(actor, id, 'ISSUED')

describe('issuing an invoice with billing enforced', () => {
  it('lets a Free company issue up to its 10 free invoices', async () => {
    issued(9)
    db.invoices.push(draft())

    await expect(issue('draft1')).resolves.toMatchObject({ ok: true })
    expect(db.invoices.find((row) => row.id === 'draft1')?.status).toBe('ISSUED')
  })

  it('refuses the 11th with PLAN_LIMIT_REACHED and writes nothing', async () => {
    issued(10)
    db.invoices.push(draft())

    const error = await issue('draft1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('PLAN_LIMIT_REACHED')
    expect(db.updated).toEqual([])
    expect(db.invoices.find((row) => row.id === 'draft1')?.status).toBe('DRAFT')
  })

  it('does not limit a Business company', async () => {
    db.subscription = business
    issued(40)
    db.invoices.push(draft())

    await expect(issue('draft1')).resolves.toMatchObject({ ok: true })
  })

  it('does not limit a grandfathered company', async () => {
    db.subscription = grandfathered
    issued(400)
    db.invoices.push(draft())

    await expect(issue('draft1')).resolves.toMatchObject({ ok: true })
  })

  it('does not block anything while BILLING_ENFORCED is off', async () => {
    process.env.BILLING_ENFORCED = 'false'
    issued(25)
    db.invoices.push(draft())

    await expect(issue('draft1')).resolves.toMatchObject({ ok: true })
  })

  it('never guards cancelling, even over the limit', async () => {
    issued(12)

    await expect(changeInvoiceStatus(actor, 'i0', 'CANCELLED')).resolves.toMatchObject({ ok: true })
  })

  it('does not give the slot back when an issued invoice is cancelled', async () => {
    issued(10)
    db.invoices.push(draft())

    await changeInvoiceStatus(actor, 'i0', 'CANCELLED')

    // Still 10 used (a cancelled invoice was issued once), so the next one is refused.
    await expect(issue('draft1')).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' })
  })

  it('does not refuse re-issuing a draft that was issued before (it already holds its slot)', async () => {
    issued(9)
    db.invoices.push(draft('again', new Date()))
    db.invoices.push(draft())

    // 9 issued + the one issued-then-reverted = 10 used: a NEW draft is refused ...
    await expect(issue('draft1')).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' })
    // ... but the one that already counts is not.
    await expect(issue('again')).resolves.toMatchObject({ ok: true })
  })
})

describe('creating an invoice directly as ISSUED', () => {
  const input = (status: 'DRAFT' | 'ISSUED') =>
    invoiceInputSchema.parse({
      customerId: 'cu1',
      invoiceDate: '2026-11-15',
      status,
      lines: [{ description: 'Board', unit: 'SQFT', quantity: 1, rate: 100 }],
    })

  it('is refused at the limit; a draft is not', async () => {
    issued(10)

    await expect(createInvoice(actor, input('ISSUED'))).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' })
    await expect(createInvoice(actor, input('DRAFT'))).resolves.toMatchObject({ ok: true })
  })

  it('is allowed below the limit', async () => {
    issued(3)

    await expect(createInvoice(actor, input('ISSUED'))).resolves.toMatchObject({ ok: true })
  })
})
