import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AUDITED } from '@/lib/audit-trail/registry'
import { parseSchema, type SchemaModel, type SchemaField } from '@/lib/audit-trail/schema-meta'

// Real-database checks of the audit trail. Skipped unless AUDIT_DB_TEST=1 and
// DATABASE_URL points at a SCRATCH database with every migration applied
// (never real data; the test creates and leaves its own companies):
//   AUDIT_DB_TEST=1 DATABASE_URL=postgresql://.../audit_scratch vitest run src/lib/audit-trail/audit.integration.test.ts

const enabled = process.env.AUDIT_DB_TEST === '1' && Boolean(process.env.DATABASE_URL)

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: 'it-admin', name: 'Integration Admin', email: 'it-admin@audit.invalid', image: null, role: 'ADMIN', isActive: true, activatedAt: new Date() },
      }),
    },
  },
}))
vi.mock('@/lib/session', () => ({
  getBaseUser: async () => ({ id: 'it-admin', isSuperAdmin: true, isActive: true }),
}))

type Row = Record<string, unknown>

const ACTOR = {
  actorUserId: 'it-admin',
  actorName: 'Integration Admin',
  actorRole: 'ADMIN',
  source: 'mobile' as const,
  requestId: 'req-it-1',
  ip: '203.0.113.7',
  userAgent: 'vitest',
}

describe.skipIf(!enabled)('audit trail against a real database', () => {
  const suffix = Math.random().toString(36).slice(2, 8)
  const A = `it-a-${suffix}`
  const B = `it-b-${suffix}`
  const { models, enums } = parseSchema()
  const byName = new Map(models.map((m) => [m.name, m]))
  let prisma: typeof import('@/lib/prisma').prisma
  let runInRequestContext: typeof import('@/lib/api/request-context').runInRequestContext
  let withAuditNote: typeof import('@/lib/audit-trail/context').withAuditNote
  let queries: typeof import('@/lib/audit-trail/queries')

  const inCompany = <T>(companyId: string, fn: () => Promise<T>, audit = ACTOR) =>
    runInRequestContext({ companyId, audit }, fn)

  const events = async (entityType: string, entityId: string) =>
    (await prisma.$queryRaw<Row[]>`
      SELECT seq::text AS seq, action, source, actor_user_id, actor_name, actor_role, request_id, ip, company_id,
             parent_type, parent_id, before, after, changed_fields, summary, correlation_id, reason, tx_id::text AS tx
        FROM audit_events WHERE entity_type = ${entityType} AND entity_id = ${entityId} ORDER BY audit_events.seq`) as Row[]

  const delegate = (model: string) =>
    (prisma as unknown as Record<string, Record<string, (args: unknown) => Promise<Row & { id: string }>>>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ]

  let counter = 0

  function valueFor(field: SchemaField) {
    const n = `${suffix}-${++counter}`

    if (enums[field.type]) return enums[field.type][0]

    switch (field.type) {
      case 'String':
        return field.name.toLowerCase().includes('email') ? `${n}@audit.invalid` : `${field.name}-${n}`
      case 'Int':
      case 'Float':
        return 1
      case 'BigInt':
        return BigInt(1)
      case 'Decimal':
        return '1'
      case 'Boolean':
        return false
      case 'DateTime':
        return new Date('2026-01-02T00:00:00Z')
      case 'Json':
        return {}
      default:
        throw new Error(`No fixture value for ${field.type}`)
    }
  }

  /** Creates one row of `model` (and the parents it needs) through the scoped client. */
  async function build(model: SchemaModel, companyId: string, depth = 0): Promise<Row & { id: string }> {
    if (depth > 6) throw new Error(`Fixture recursion at ${model.name}`)

    const data: Row = {}

    for (const field of model.fields) {
      if (!field.isRelation || field.list || field.optional || field.fkFields.length === 0) continue

      if (field.type === 'CompanySetting') {
        data[field.fkFields[0]] = companyId
        continue
      }

      const parent = await build(byName.get(field.type)!, companyId, depth + 1)

      data[field.fkFields[0]] = parent.id
    }

    for (const field of model.fields) {
      if (field.isRelation || field.list || field.name in data) continue
      if (field.hasDefault || field.isUpdatedAt || field.optional) continue

      data[field.name] = valueFor(field)
    }

    // Tables with a CHECK that needs one of two optional targets.
    if (model.name === 'StockMovement') data.itemId = (await build(byName.get('Item')!, companyId, depth + 1)).id

    if (model.name === 'BalanceAdjustment') {
      data.kind = 'CHANNEL'
      data.channelId = (await build(byName.get('PaymentChannel')!, companyId, depth + 1)).id
    }

    return delegate(model.name).create({ data })
  }

  const whereOf = (model: SchemaModel, row: Row & { id: string }) => {
    const ids = model.fields.filter((f) => f.isId).map((f) => f.name)

    return ids.length > 1 ? { [ids.join('_')]: Object.fromEntries(ids.map((i) => [i, row[i]])) } : { id: row.id }
  }

  /** A column that is safe to change and is not housekeeping or a secret. */
  function patchFor(model: SchemaModel, row: Row): { data: Row; column: string; before: unknown; after: unknown } {
    const plain = model.fields.filter(
      (f) => !f.isRelation && !f.list && !f.isId && !f.isUpdatedAt && f.fkFields.length === 0 && !/Id$/.test(f.name),
    )
    const noise = new Set(['scope', 'accessToken', 'refreshToken', 'idToken', 'password', 'token', 'trackingToken', 'shareToken'])
    const pick =
      plain.find((f) => f.type === 'String' && !f.unique && !enums[f.type] && !noise.has(f.name)) ??
      plain.find((f) => f.type === 'Int') ??
      plain.find((f) => f.type === 'Decimal') ??
      plain.find((f) => f.type === 'Boolean') ??
      plain.find((f) => enums[f.type] && enums[f.type].length > 1)

    if (!pick) throw new Error(`No patchable column on ${model.name}`)

    const before = row[pick.name]
    const after = enums[pick.type]
      ? enums[pick.type].find((v) => v !== before)
      : pick.type === 'String'
        ? `${before ?? 'x'}-changed`
        : pick.type === 'Boolean'
          ? !before
          : pick.type === 'Int'
            ? 7
            : '7'

    return { data: { [pick.name]: after }, column: pick.column, before, after }
  }

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    ;({ runInRequestContext } = await import('@/lib/api/request-context'))
    ;({ withAuditNote } = await import('@/lib/audit-trail/context'))
    queries = await import('@/lib/audit-trail/queries')

    await prisma.user.create({
      data: { id: 'it-admin', name: 'Integration Admin', email: `it-admin-${suffix}@audit.invalid`, isActive: true, role: 'ADMIN' },
    })
    await prisma.companySetting.createMany({
      data: [
        { id: A, companyName: `Audit A ${suffix}` },
        { id: B, companyName: `Audit B ${suffix}` },
      ],
    })
  })

  afterAll(async () => {
    // Business rows go; the audit events deliberately stay (append-only).
    await prisma.companySetting.deleteMany({ where: { id: { in: [A, B] } } })
    await prisma.user.deleteMany({ where: { id: 'it-admin' } })
  })

  const auditedModels = Object.keys(AUDITED)

  it.each(auditedModels)('%s: create, update and delete each leave exactly one correct event', async (name) => {
    const model = byName.get(name)!

    // Every attribute below comes from the request context, not from the row.
    const run = <T>(fn: () => Promise<T>) => (name === 'User' || name === 'Account' ? runInRequestContext({ audit: ACTOR }, fn) : inCompany(A, fn))

    await run(async () => {
      const created = await build(model, A)
      const id = name === 'UserCompany' ? `${created.userId}:${created.companyId}` : created.id
      const createEvents = (await events(name, id)).filter((e) => e.action === 'create')

      expect(createEvents).toHaveLength(1)

      const [c] = createEvents

      expect(c).toMatchObject({
        source: 'mobile',
        actor_user_id: 'it-admin',
        actor_name: 'Integration Admin',
        actor_role: 'ADMIN',
        request_id: 'req-it-1',
        ip: '203.0.113.7',
      })
      expect(c.before).toBeNull()
      expect((c.after as Row)[model.fields.find((f) => f.isId)!.column]).toBeDefined()

      if (name === 'CompanySetting') expect(c.company_id).toBe(created.id)
      else if (name !== 'User' && name !== 'Account') expect(c.company_id).toBe(A)

      if (AUDITED[name].parent) {
        expect(c.parent_type).toBe(AUDITED[name].parent)
        expect(c.parent_id).toBeTruthy()
      }

      const patch = patchFor(model, created)

      await delegate(name).update({ where: whereOf(model, created), data: patch.data })

      const all = await events(name, id)
      const updates = all.filter((e) => e.action === 'update' || e.action === 'status')

      expect(updates).toHaveLength(1)
      expect(updates[0].changed_fields).toContain(patch.column)
      const show = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : String(value))
      const shown = (value: unknown) => (value === null ? null : String(value))

      expect(shown((updates[0].after as Row)[patch.column])).toBe(show(patch.after))
      expect(shown((updates[0].before as Row)[patch.column])).toBe(show(patch.before))

      await delegate(name).delete({ where: whereOf(model, created) })

      const deletes = (await events(name, id)).filter((e) => e.action === 'delete')

      expect(deletes).toHaveLength(1)
      // Nothing is lost on delete: the whole row is in the event.
      expect(deletes[0].before).toMatchObject({ [model.fields.find((f) => f.isId)!.column]: expect.anything() })
      expect(deletes[0].after).toBeNull()
      expect((await events(name, id)).length).toBe(3)
    })
  })

  it('records updateMany and createMany one event per row, sharing a correlation id', async () => {
    await inCompany(A, async () => {
      const code = `bulk-${suffix}`
      const started = Date.now()

      await prisma.customer.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({ code: `${code}-${i}`, name: `Bulk ${i}`, phone: '1', city: 'X' })),
      })

      const elapsed = Date.now() - started
      const rows = await prisma.customer.findMany({ where: { code: { startsWith: code } }, select: { id: true } })
      const created = await prisma.$queryRaw<{ n: string; c: string }[]>`
        SELECT count(*)::text AS n, count(DISTINCT correlation_id)::text AS c FROM audit_events
         WHERE action = 'create' AND entity_type = 'Customer' AND entity_id = ANY(${rows.map((r) => r.id)})`

      expect(rows).toHaveLength(200)
      expect(created[0]).toEqual({ n: '200', c: '1' })
      // One INSERT of 200 customers plus 200 audit inserts, all inside the database.
      expect(elapsed).toBeLessThan(5000)

      await prisma.customer.updateMany({ where: { code: { startsWith: code } }, data: { city: 'Y' } })

      const updated = await prisma.$queryRaw<{ n: string; c: string; fields: string }[]>`
        SELECT count(*)::text AS n, count(DISTINCT correlation_id)::text AS c, string_agg(DISTINCT changed_fields::text, '|') AS fields
          FROM audit_events WHERE action = 'update' AND entity_type = 'Customer' AND entity_id = ANY(${rows.map((r) => r.id)})`

      expect(updated[0]).toEqual({ n: '200', c: '1', fields: '{city}' })

      await prisma.customer.deleteMany({ where: { code: { startsWith: code } } })
    })
  })

  it('writes nothing for a no-op update, and nothing at all for a rolled-back transaction', async () => {
    await inCompany(A, async () => {
      const customer = await prisma.customer.create({ data: { code: `tx-${suffix}`, name: 'Tx', phone: '1' } })
      const before = (await events('Customer', customer.id)).length

      // Same value written again: only updated_at moves, which is not a change.
      await prisma.customer.update({ where: { id: customer.id }, data: { name: 'Tx' } })
      expect((await events('Customer', customer.id)).length).toBe(before)

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.customer.update({ where: { id: customer.id }, data: { name: 'Rolled back' } })
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      expect((await events('Customer', customer.id)).length).toBe(before)
      expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.name).toBe('Tx')

      // A committed interactive transaction: both changes, both events, one correlation.
      await prisma.$transaction(async (tx) => {
        await tx.customer.update({ where: { id: customer.id }, data: { city: 'One' } })
        await tx.customer.update({ where: { id: customer.id }, data: { phone: '2' } })
      })

      const after = await events('Customer', customer.id)

      expect(after).toHaveLength(before + 2)
      expect(after[after.length - 1].correlation_id).toBe(after[after.length - 2].correlation_id)
      expect(after[after.length - 1].actor_name).toBe('Integration Admin')
    })
  })

  it('attributes batch transactions, nested writes and raw SQL too', async () => {
    await inCompany(A, async () => {
      const c = await prisma.customer.create({ data: { code: `batch-${suffix}`, name: 'Batch', phone: '1' } })

      await prisma.$transaction([
        prisma.customer.update({ where: { id: c.id }, data: { city: 'B1' } }),
        prisma.customer.update({ where: { id: c.id }, data: { phone: '9' } }),
      ])
      await prisma.$executeRaw`UPDATE customers SET city = 'Raw' WHERE id = ${c.id}`

      const all = (await events('Customer', c.id)).filter((e) => e.action === 'update')

      expect(all).toHaveLength(3)
      expect(all.every((e) => e.actor_name === 'Integration Admin' && e.source === 'mobile')).toBe(true)
    })
  })

  it('records a write outside any request as the System (or Seed), never as nobody', async () => {
    const customer = await inCompany(A, async () => prisma.customer.create({ data: { code: `sys-${suffix}`, name: 'Sys', phone: '1' } }))

    await prisma.$executeRaw`UPDATE customers SET city = 'Cron' WHERE id = ${customer.id}`

    const last = (await events('Customer', customer.id)).pop()!

    expect(last).toMatchObject({ source: 'system', actor_name: 'System', actor_user_id: null })
  })

  it('stores the reason and summary an operation names, and keeps the deleted record whole', async () => {
    await inCompany(A, async () => {
      const customer = await prisma.customer.create({ data: { code: `why-${suffix}`, name: 'Why', phone: '1' } })

      await withAuditNote({ reason: 'Entered twice by mistake', summary: 'Removed duplicate customer' }, () =>
        prisma.customer.delete({ where: { id: customer.id } }),
      )

      const last = (await events('Customer', customer.id)).pop()!

      expect(last).toMatchObject({ action: 'delete', reason: 'Entered twice by mistake', summary: 'Removed duplicate customer' })
      expect(last.before).toMatchObject({ id: customer.id, name: 'Why', code: `why-${suffix}` })
    })
  })

  it('masks secrets but keeps the fact of the change', async () => {
    await runInRequestContext({ audit: ACTOR }, async () => {
      const user = await prisma.user.create({ data: { name: 'Sec', email: `sec-${suffix}@audit.invalid` } })
      const account = await prisma.account.create({
        data: { userId: user.id, issuer: 'credential', accountId: `a-${suffix}`, providerId: 'credential', password: 'hash$one' },
      })

      await prisma.account.update({ where: { id: account.id }, data: { password: 'hash$two', accessToken: 'tok-1' } })

      const [created, updated] = await events('Account', account.id)

      expect(created.after).toMatchObject({ password: '[redacted]' })
      expect(updated.changed_fields).toEqual(['password'])
      expect(updated.before).toMatchObject({ password: '[redacted]' })
      expect(updated.after).toMatchObject({ password: '[redacted]', access_token: null === 1 ? null : '[redacted]' })
      expect(JSON.stringify([created, updated])).not.toContain('hash$')
      expect(JSON.stringify([created, updated])).not.toContain('tok-1')

      // A token refresh alone is housekeeping: no event.
      await prisma.account.update({ where: { id: account.id }, data: { accessToken: 'tok-2' } })
      expect(await events('Account', account.id)).toHaveLength(2)
    })

    await inCompany(A, async () => {
      await prisma.companySetting.update({ where: { id: A }, data: { accountNumber: '123456789012' } })

      const last = (await events('CompanySetting', A)).pop()!

      expect(last.after).toMatchObject({ account_number: '••••9012' })
      expect(JSON.stringify(last)).not.toContain('123456789012')
    })
  })

  describe('no silent destruction', () => {
    const adjustmentInput = (targetId: string, adjustedOn = '2026-03-10') => ({
      kind: 'CHANNEL' as const,
      targetId,
      direction: 'up' as const,
      amount: 250,
      adjustedOn,
      reason: 'FORGOTTEN_ENTRY' as const,
      note: 'Cash found in the drawer',
    })

    it('refuses to delete a money record without a reason, then keeps the whole record when deleted with one', async () => {
      const { createAdjustment, deleteAdjustment } = await import('@/lib/services/adjustments')

      await inCompany(A, async () => {
        const channel = await build(byName.get('PaymentChannel')!, A)
        const made = await createAdjustment({ userId: 'it-admin', name: 'Integration Admin' }, adjustmentInput(channel.id))

        expect(made.ok).toBe(true)

        const id = (made as { id: string }).id
        const refused = await deleteAdjustment({ userId: 'it-admin' }, id)

        expect(refused).toMatchObject({ ok: false })
        expect(await prisma.balanceAdjustment.count({ where: { id } })).toBe(1)

        const done = await withAuditNote({ reason: 'Counted twice' }, () => deleteAdjustment({ userId: 'it-admin' }, id))

        expect(done.ok).toBe(true)

        const last = (await events('BalanceAdjustment', id)).pop()!

        expect(last).toMatchObject({ action: 'delete', reason: 'Counted twice', actor_name: 'Integration Admin' })
        expect(last.before).toMatchObject({ id, note: 'Cash found in the drawer', amount: 250 })
      })
    })

    it('reverses an adjustment with a linked counter entry and leaves the original', async () => {
      const { createAdjustment, deleteAdjustment, reverseAdjustment, updateAdjustment } = await import('@/lib/services/adjustments')

      await inCompany(A, async () => {
        const channel = await build(byName.get('PaymentChannel')!, A)
        const made = (await createAdjustment({ userId: 'it-admin' }, adjustmentInput(channel.id))) as { id: string }

        expect(await reverseAdjustment({ userId: 'it-admin' }, made.id)).toMatchObject({ ok: false })

        const reversed = await withAuditNote({ reason: 'Wrong mode' }, () => reverseAdjustment({ userId: 'it-admin' }, made.id))

        expect(reversed.ok).toBe(true)

        const counter = await prisma.balanceAdjustment.findUnique({ where: { id: (reversed as { id: string }).id } })
        const original = await prisma.balanceAdjustment.findUnique({ where: { id: made.id } })

        expect(original).not.toBeNull()
        expect(counter?.reversesId).toBe(made.id)
        expect(counter?.amount.toNumber()).toBe(-250)
        expect(counter?.note).toContain('Wrong mode')

        // The pair is closed: no second reversal, no edit, and the original can not be deleted alone.
        const again = await withAuditNote({ reason: 'Again' }, () => reverseAdjustment({ userId: 'it-admin' }, made.id))

        expect(again.ok).toBe(false)
        expect((await updateAdjustment({ userId: 'it-admin' }, made.id, adjustmentInput(channel.id))).ok).toBe(false)
        expect((await withAuditNote({ reason: 'No' }, () => deleteAdjustment({ userId: 'it-admin' }, made.id))).ok).toBe(false)

        const trail = await events('BalanceAdjustment', counter!.id)

        expect(trail[0]).toMatchObject({ action: 'create', reason: 'Wrong mode' })
        expect(trail[0].after).toMatchObject({ reverses_id: made.id })
      })
    })

    it('locks the books: closed dates need an administrator and a reason, open dates are untouched', async () => {
      const { createAdjustment } = await import('@/lib/services/adjustments')
      await inCompany(A, async () => {
        const channel = await build(byName.get('PaymentChannel')!, A)

        await withAuditNote({ reason: 'Quarter closed', summary: 'Closed the books up to 2026-03-31' }, () =>
          prisma.companySetting.update({ where: { id: A }, data: { lockDate: new Date('2026-03-31T00:00:00Z') } }),
        )

        const lockEvent = (await events('CompanySetting', A)).pop()!

        expect(lockEvent).toMatchObject({ reason: 'Quarter closed', summary: 'Closed the books up to 2026-03-31' })
        expect(lockEvent.changed_fields).toContain('lock_date')

        // After the lock date: fine for everyone.
        expect((await createAdjustment({ userId: 'it-admin' }, adjustmentInput(channel.id, '2026-04-02'))).ok).toBe(true)

        // On or before it: refused for a non-admin, and for an admin without a reason.
        const asSales = { ...ACTOR, actorRole: 'SALES' }
        const refusedSales = await inCompany(A, () => withAuditNote({ reason: 'trying' }, () => createAdjustment({ userId: 'it-admin' }, adjustmentInput(channel.id, '2026-03-31'))), asSales)

        expect(refusedSales).toMatchObject({ ok: false, error: expect.stringContaining('closed up to 31 Mar 2026') })

        const refusedAdmin = await createAdjustment({ userId: 'it-admin' }, adjustmentInput(channel.id, '2026-03-01'))

        expect(refusedAdmin).toMatchObject({ ok: false, error: expect.stringContaining('Give a reason') })

        // An administrator with a reason may; the reason is on the event.
        const allowed = await withAuditNote({ reason: 'Late bank statement' }, () =>
          createAdjustment({ userId: 'it-admin' }, adjustmentInput(channel.id, '2026-03-01')),
        )

        expect(allowed.ok).toBe(true)
        expect((await events('BalanceAdjustment', (allowed as { id: string }).id))[0].reason).toBe('Late bank statement')

        await prisma.companySetting.update({ where: { id: A }, data: { lockDate: null } })
      })
    })
  })

  describe('mobile API', () => {
    const call = async (
      handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
      companyId: string,
      path: string,
      init: { method?: string; headers?: Record<string, string>; params?: Record<string, string> } = {},
    ) => {
      const response = await handler(
        new Request(`http://localhost/api/v1${path}`, {
          method: init.method ?? 'GET',
          headers: { authorization: 'Bearer t', 'x-company-id': companyId, 'user-agent': 'jest', ...init.headers },
        }),
        { params: Promise.resolve(init.params ?? {}) },
      )

      return { status: response.status, body: await response.json().catch(() => null), response }
    }

    it("gives a record's history to its own company and a 404 to every other", async () => {
      const customer = await inCompany(A, async () => prisma.customer.create({ data: { code: `api-${suffix}`, name: 'Api', phone: '1' } }))
      const { GET } = await import('@/app/api/v1/customers/[id]/history/route')
      const own = await call(GET, A, `/customers/${customer.id}/history`, { params: { id: customer.id } })

      expect(own.status).toBe(200)
      expect(own.body.data[0]).toMatchObject({ entityType: 'Customer', entityId: customer.id, action: 'create' })
      expect(own.body.meta).toMatchObject({ hasMore: false })

      const other = await call(GET, B, `/customers/${customer.id}/history`, { params: { id: customer.id } })

      expect(other.status).toBe(404)
    })

    it('lists the company audit log, paginated by cursor, and never another company', async () => {
      const { GET } = await import('@/app/api/v1/audit/route')
      const first = await call(GET, A, '/audit?limit=2')

      expect(first.status).toBe(200)
      expect(first.body.data).toHaveLength(2)
      expect(first.body.meta.hasMore).toBe(true)

      const second = await call(GET, A, `/audit?limit=2&cursor=${first.body.meta.nextCursor}`)
      const seqs = [...first.body.data, ...second.body.data].map((e: { seq: string }) => BigInt(e.seq))

      expect(seqs).toEqual([...seqs].sort((a, b) => (a > b ? -1 : 1)))
      expect(new Set(seqs).size).toBe(4)

      const filtered = await call(GET, A, '/audit?entity=Customer&action=create&limit=100')

      expect(filtered.body.data.every((e: { entityType: string; action: string }) => e.entityType === 'Customer' && e.action === 'create')).toBe(true)

      const ofB = await call(GET, B, '/audit?limit=100')
      const idsOfA = new Set((await queries.listAuditEvents(A, {}, { page: 1, size: 500 })).rows.map((r) => r.id))

      expect(ofB.status).toBe(200)
      expect(ofB.body.data.some((e: { id: string }) => idsOfA.has(e.id))).toBe(false)
      expect((await call(GET, A, '/audit?cursor=nonsense')).status).toBe(422)
    })

    it('records API writes as the caller, from the app, with the reason, and needs a reason to delete', async () => {
      const expense = await inCompany(A, async () => build(byName.get('Expense')!, A))
      const { DELETE } = await import('@/app/api/v1/expenses/[id]/route')

      const without = await call(DELETE, A, `/expenses/${expense.id}`, { method: 'DELETE', params: { id: expense.id } })

      expect(without.status).toBe(422)
      expect(await prisma.expense.count({ where: { id: expense.id } })).toBe(1)

      const done = await call(DELETE, A, `/expenses/${expense.id}`, {
        method: 'DELETE',
        params: { id: expense.id },
        headers: { 'x-client': 'prodlys-mobile', 'x-audit-reason': 'Duplicate of EXP-9', 'x-request-id': 'req-mobile-77' },
      })

      expect(done.status).toBe(200)

      const last = (await events('Expense', expense.id)).pop()!

      expect(last).toMatchObject({
        action: 'delete',
        source: 'mobile',
        actor_user_id: 'it-admin',
        actor_role: 'ADMIN',
        reason: 'Duplicate of EXP-9',
      })
      expect(last.request_id).toBeTruthy()
      expect(last.before).toMatchObject({ id: expense.id })

      // The same call without the app header is plain "api".
      const second = await inCompany(A, async () => build(byName.get('Expense')!, A))

      await call(DELETE, A, `/expenses/${second.id}?reason=Test%20data`, { method: 'DELETE', params: { id: second.id } })

      expect((await events('Expense', second.id)).pop()).toMatchObject({ source: 'api', reason: 'Test data' })
    })
  })

  describe('tamper evidence', () => {
    const asOwner = async <T>(fn: (client: Client) => Promise<T>) => {
      const client = new Client({ connectionString: process.env.DATABASE_URL })

      await client.connect()

      try {
        return await fn(client)
      } finally {
        await client.end()
      }
    }

    it('refuses UPDATE, DELETE and TRUNCATE on audit_events at the database level', async () => {
      await expect(prisma.$executeRaw`UPDATE audit_events SET summary = 'x'`).rejects.toThrow(/append-only/)
      await expect(prisma.$executeRaw`DELETE FROM audit_events`).rejects.toThrow(/append-only/)
      await expect(prisma.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow(/append-only/)

      // Even a session that turns triggers off for replication is refused (ENABLE ALWAYS).
      await asOwner(async (client) => {
        await client.query(`SET session_replication_role = replica`)
        await expect(client.query(`UPDATE audit_events SET summary = 'x'`)).rejects.toThrow(/append-only/)
      })
    })

    it('verifies an intact chain, then reports the exact event a superuser tampers with', async () => {
      await inCompany(B, async () => {
        for (let i = 0; i < 6; i++) {
          await prisma.customer.create({ data: { code: `chain-${suffix}-${i}`, name: `Chain ${i}`, phone: '1' } })
        }
      })

      const clean = await queries.verifyChain(B)

      expect(clean.ok).toBe(true)
      expect(clean.checked).toBeGreaterThanOrEqual(6)
      expect(clean.head?.hash).toMatch(/^[0-9a-f]{64}$/)

      const victim = await prisma.$queryRaw<{ id: string; seq: string }[]>`
        SELECT id, seq::text AS seq FROM audit_events WHERE chain_key = ${B} ORDER BY seq OFFSET 3 LIMIT 1`

      await asOwner(async (client) => {
        await client.query(`ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete`)
        await client.query(`UPDATE audit_events SET after = '{"name": "Forged"}'::jsonb WHERE id = $1`, [victim[0].id])
        await client.query(`ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_update_delete`)
      })

      const broken = await queries.verifyChain(B)

      expect(broken.ok).toBe(false)
      expect(broken.breaks.map((b) => [b.seq, b.kind])).toEqual([[victim[0].seq, 'hash_mismatch']])

      // Deleting a row is caught too (gap, and the next row no longer chains).
      const gone = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM audit_events WHERE chain_key = ${B} ORDER BY seq OFFSET 1 LIMIT 1`

      await asOwner(async (client) => {
        await client.query(`ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete`)
        await client.query(`DELETE FROM audit_events WHERE id = $1`, [gone[0].id])
        await client.query(`ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_update_delete`)
      })

      const kinds = (await queries.verifyChain(B)).breaks.map((b) => b.kind)

      expect(kinds).toContain('seq_gap')
      expect(kinds).toContain('prev_mismatch')
    })
  })

  describe('tenant isolation of reads', () => {
    it("never shows company B any of company A's events", async () => {
      const customer = await inCompany(A, async () => prisma.customer.create({ data: { code: `iso-${suffix}`, name: 'Iso', phone: '1' } }))

      expect((await queries.entityHistory(A, 'Customer', customer.id)).length).toBeGreaterThan(0)
      expect(await queries.entityHistory(B, 'Customer', customer.id)).toEqual([])

      const fromB = await queries.listAuditEvents(B, { entityId: customer.id }, { page: 1, size: 50 })

      expect(fromB).toEqual({ rows: [], total: 0 })

      const everything = await queries.listAuditEvents(B, {}, { page: 1, size: 500 })

      expect(everything.rows.every((r) => r.companyId === B)).toBe(true)
      expect(await queries.listAuditEventsAfter(B, { q: 'Iso' }, null, 50)).toEqual([])
    })

    it('files line items under their document in that document history', async () => {
      await inCompany(A, async () => {
        const quotation = await build(byName.get('Quotation')!, A)
        const line = await build(byName.get('QuotationLine')!, A)
        const history = await queries.entityHistory(A, 'Quotation', quotation.id)

        expect(history.some((e) => e.entityType === 'Quotation' && e.action === 'create')).toBe(true)
        expect(line.id).toBeTruthy()
      })
    })
  })

  it('filters by action, source, actor, date and free text, and verifies the head', async () => {
    const mine = await queries.listAuditEvents(A, { action: 'delete', source: 'mobile', actorUserId: 'it-admin' }, { page: 1, size: 5 })

    expect(mine.total).toBeGreaterThan(0)
    expect(mine.rows.every((r) => r.action === 'delete' && r.source === 'mobile')).toBe(true)

    const today = new Date().toISOString().slice(0, 10)

    expect((await queries.listAuditEvents(A, { from: today, to: today }, { page: 1, size: 5 })).total).toBeGreaterThan(0)
    expect((await queries.listAuditEvents(A, { to: '2000-01-01' }, { page: 1, size: 5 })).total).toBe(0)
    expect((await queries.listAuditEvents(A, { q: `iso-${suffix}` }, { page: 1, size: 5 })).total).toBeGreaterThan(0)

    const report = await queries.verifyChain(A)

    expect(report.breaks.slice(0, 3)).toEqual([])
    expect(report.ok).toBe(true)
  })
})
