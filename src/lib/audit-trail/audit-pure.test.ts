import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AUDITED, EXCLUDED } from '@/lib/audit-trail/registry'
import { parseSchema } from '@/lib/audit-trail/schema-meta'
import {
  GENESIS_HASH,
  canonicalText,
  computeHash,
  verifyRows,
  type ChainRow,
} from '@/lib/audit-trail/hash'
import {
  actionLabel,
  entityLabel,
  fieldChanges,
  fieldLabel,
  formatValue,
  redactSnapshot,
  sourceBadge,
} from '@/lib/audit-trail/diff'
import { sourceOfApiRequest } from '@/lib/audit-trail/context'
import { isWriteStatement } from '@/lib/audit-trail/adapter'
import { lockVerdict, reasonVerdict } from '@/lib/audit-trail/guards'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/active-company', () => ({ getActiveCompanyId: async () => null }))

describe('coverage: every Prisma model is audited or explicitly excluded', () => {
  const { models } = parseSchema()
  const migrations = readdirSync(join(process.cwd(), 'prisma/migrations'))
    .filter((dir) => dir.endsWith('_audit_trail') || /audit/.test(dir))
    .map((dir) => readFileSync(join(process.cwd(), 'prisma/migrations', dir, 'migration.sql'), 'utf8'))
    .join('\n')

  it('has no model on neither list (a new model must be classified)', () => {
    const unclassified = models.map((m) => m.name).filter((name) => !(name in AUDITED) && !(name in EXCLUDED))

    // AuditEvent is the audit table itself, listed in EXCLUDED.
    expect(unclassified).toEqual([])
  })

  it('has no stale entries for models that no longer exist', () => {
    const names = new Set(models.map((m) => m.name))

    expect(Object.keys(AUDITED).filter((n) => !names.has(n))).toEqual([])
    expect(Object.keys(EXCLUDED).filter((n) => !names.has(n))).toEqual([])
  })

  it('never lists a model as both audited and excluded, and every exclusion has a reason', () => {
    expect(Object.keys(AUDITED).filter((n) => n in EXCLUDED)).toEqual([])
    expect(Object.values(EXCLUDED).every((reason) => reason.length > 20)).toBe(true)
  })

  it('has a trigger (audit_attach) in the migrations for exactly the audited models, on the right table', () => {
    const attached = [...migrations.matchAll(/audit_attach\(\s*'(\w+)',\s*'(\w+)'/g)].map((m) => [m[2], m[1]])
    const byModel = Object.fromEntries(attached)

    expect(Object.keys(byModel).sort()).toEqual(Object.keys(AUDITED).sort())

    for (const model of models) {
      if (model.name in AUDITED) expect(byModel[model.name]).toBe(model.table)
      expect(AUDITED[model.name]?.table ?? model.table).toBe(model.table)
    }
  })

  it('masks the same secret columns in the registry and in the triggers', () => {
    for (const [model, spec] of Object.entries(AUDITED)) {
      const call = new RegExp(`audit_attach\\([^;]*?'${model}'[^;]*?\\);`, 's').exec(migrations)?.[0] ?? ''
      const inSql = [...call.matchAll(/'([\w~,]+)'/g)].map((m) => m[1]).flatMap((s) => s.split(','))

      for (const secret of spec.secrets ?? []) expect(inSql).toContain(secret)
    }
  })

  it('knows the parent of every line item so documents show their lines', () => {
    const children = Object.entries(AUDITED).filter(([, spec]) => spec.parent)

    expect(children.length).toBeGreaterThanOrEqual(16)
    for (const [, spec] of children) expect(spec.parent! in AUDITED).toBe(true)
  })
})

const row = (patch: Partial<ChainRow> = {}): ChainRow => ({
  id: 'e1',
  seq: '1',
  chainKey: 'co1',
  occurredAt: '2026-11-15T10:00:00.000000Z',
  companyId: 'co1',
  actorUserId: 'u1',
  actorName: 'Asha',
  actorRole: 'ADMIN',
  source: 'web',
  requestId: 'r1',
  ip: '10.0.0.1',
  userAgent: 'jest',
  entityType: 'Customer',
  entityId: 'c1',
  parentType: null,
  parentId: null,
  action: 'update',
  before: '{"city": "Surat"}',
  after: '{"city": "Pune"}',
  changedFields: 'city',
  summary: 'Updated customer',
  correlationId: 'tx:1',
  reason: null,
  txId: '1',
  prevHash: GENESIS_HASH,
  hash: '',
  ...patch,
})

function chain(count: number): ChainRow[] {
  const rows: ChainRow[] = []
  let prev = GENESIS_HASH

  for (let i = 1; i <= count; i++) {
    const r = row({ id: `e${i}`, seq: String(i), prevHash: prev, summary: `event ${i}` })

    r.hash = computeHash(r)
    prev = r.hash
    rows.push(r)
  }

  return rows
}

describe('hash chain', () => {
  it('hashes a fixed canonical text, stable and sensitive to every field', () => {
    const base = row()

    expect(canonicalText(base).split(String.fromCharCode(31))).toHaveLength(25)
    expect(computeHash(base)).toMatch(/^[0-9a-f]{64}$/)
    expect(computeHash(base)).toBe(computeHash({ ...base }))

    for (const patch of [
      { summary: 'x' },
      { after: '{"city": "Goa"}' },
      { actorName: 'Eve' },
      { reason: 'why' },
      { seq: '2' },
      { prevHash: 'f'.repeat(64) },
      { occurredAt: '2026-11-15T10:00:00.000001Z' },
    ]) {
      expect(computeHash({ ...base, ...patch })).not.toBe(computeHash(base))
    }
  })

  it('treats a null field and an empty one the same way the database does', () => {
    expect(computeHash(row({ reason: null }))).toBe(computeHash(row({ reason: '' })))
  })

  it('accepts an intact chain', () => {
    const result = verifyRows(chain(5))

    expect(result.breaks).toEqual([])
    expect(result.state.nextSeq).toBe(BigInt(6))
  })

  it('catches an edited row', () => {
    const rows = chain(5)

    rows[2] = { ...rows[2], after: '{"city": "TAMPERED"}' }

    const { breaks } = verifyRows(rows)

    expect(breaks.map((b) => [b.seq, b.kind])).toEqual([['3', 'hash_mismatch']])
  })

  it('catches a deleted row (gap, and the next row no longer chains)', () => {
    const rows = chain(5)

    rows.splice(2, 1)

    const kinds = verifyRows(rows).breaks.map((b) => b.kind)

    expect(kinds).toContain('seq_gap')
    expect(kinds).toContain('prev_mismatch')
  })

  it('catches a forged row re-hashed in place only if its neighbours still chain', () => {
    const rows = chain(4)
    const forged = { ...rows[1], summary: 'forged' }

    forged.hash = computeHash(forged)
    rows[1] = forged

    // The forger fixed row 2's own hash, but row 3 still points at the old one.
    expect(verifyRows(rows).breaks.map((b) => [b.seq, b.kind])).toEqual([['3', 'prev_mismatch']])
  })

  it('continues across pages by carrying the state', () => {
    const rows = chain(6)
    const first = verifyRows(rows.slice(0, 3))
    const second = verifyRows(rows.slice(3), first.state)

    expect([...first.breaks, ...second.breaks]).toEqual([])
  })

  it('flags a chain that does not start at 1', () => {
    const rows = chain(3).slice(1)

    expect(verifyRows(rows).breaks[0]?.kind).toBe('bad_start')
  })
})

describe('diff and presentation', () => {
  it('lists only the changed columns of an update, with before and after', () => {
    const changes = fieldChanges({
      action: 'update',
      before: { city: 'Surat', phone: '1', updated_at: 'a' },
      after: { city: 'Pune', phone: '1', updated_at: 'b' },
      changedFields: ['city', 'updated_at'],
    })

    expect(changes).toEqual([{ field: 'city', label: 'City', before: 'Surat', after: 'Pune' }])
  })

  it('shows a create as what was set and a delete as what was removed', () => {
    const created = fieldChanges({ action: 'create', before: null, after: { name: 'A', city: null }, changedFields: ['name'] })
    const deleted = fieldChanges({ action: 'delete', before: { name: 'A' }, after: null, changedFields: ['name'] })

    expect(created[0]).toMatchObject({ field: 'name', before: undefined, after: 'A' })
    expect(deleted[0]).toMatchObject({ field: 'name', before: 'A', after: undefined })
  })

  it('writes readable labels and values', () => {
    expect(fieldLabel('company_name')).toBe('Company name')
    expect(fieldLabel('customer_id')).toBe('Customer')
    expect(fieldLabel('gstin')).toBe('GSTIN')
    expect(entityLabel('PurchaseBill')).toBe('Purchase bill')
    expect(formatValue(null)).toBe('—')
    expect(formatValue(true)).toBe('Yes')
    expect(formatValue('')).toBe('(empty)')
    expect(formatValue('1250000.5', 'total_amount')).toBe('12,50,000.5')
    expect(formatValue('2026-11-15T00:00:00.000Z', 'paid_on')).toBe('2026-11-15')
    expect(actionLabel('status')).toBe('Status changed')
    expect(sourceBadge('mobile').label).toBe('App')
    expect(sourceBadge('weird').label).toBe('weird')
  })
})

describe('redaction', () => {
  it('masks secrets fully, or keeps the last four, and leaves everything else', () => {
    expect(redactSnapshot('Account', { password: 'hash$abc', access_token: 'tok', scope: 'x', password_note: 'n' })).toEqual({
      password: '[redacted]',
      access_token: '[redacted]',
      scope: 'x',
      password_note: 'n',
    })
    expect(redactSnapshot('CompanySetting', { account_number: '123456789012', ifsc_code: 'HDFC0001' })).toEqual({
      account_number: '••••9012',
      ifsc_code: 'HDFC0001',
    })
  })

  it('keeps null (nothing to hide) and passes unknown models and non-objects through', () => {
    expect(redactSnapshot('Account', { password: null })).toEqual({ password: null })
    expect(redactSnapshot('Customer', { name: 'x' })).toEqual({ name: 'x' })
    expect(redactSnapshot('Account', null)).toBeNull()
  })
})

describe('request attribution', () => {
  it('calls the app mobile by X-Client or an Expo user agent, otherwise api', () => {
    expect(sourceOfApiRequest(new Headers({ 'x-client': 'prodlys-mobile' }))).toBe('mobile')
    expect(sourceOfApiRequest(new Headers({ 'user-agent': 'Expo/2.31 CFNetwork' }))).toBe('mobile')
    expect(sourceOfApiRequest(new Headers({ 'user-agent': 'curl/8' }))).toBe('api')
    expect(sourceOfApiRequest(new Headers())).toBe('api')
  })

  it('only gives a transaction to statements that write', () => {
    expect(isWriteStatement('INSERT INTO "customers" (a) VALUES ($1)')).toBe(true)
    expect(isWriteStatement('  update customers set a = 1')).toBe(true)
    expect(isWriteStatement('DELETE FROM x')).toBe(true)
    expect(isWriteStatement('WITH a AS (SELECT 1) INSERT INTO x SELECT * FROM a')).toBe(true)
    expect(isWriteStatement('SELECT * FROM customers')).toBe(false)
    expect(isWriteStatement('SELECT set_config($1, $2, true)')).toBe(false)
  })
})

describe('lock date and reasons', () => {
  const lock = '2026-03-31'

  it('lets everything through when no lock is set', () => {
    expect(lockVerdict({ lockDate: null, dates: ['2020-01-01'], role: 'SALES', reason: null })).toEqual({ ok: true })
  })

  it('lets dates after the lock through, whoever asks', () => {
    expect(lockVerdict({ lockDate: lock, dates: ['2026-04-01'], role: 'SALES', reason: null }).ok).toBe(true)
    expect(lockVerdict({ lockDate: lock, dates: [null, undefined], role: 'SALES', reason: null }).ok).toBe(true)
  })

  it('treats the lock date itself as closed', () => {
    expect(lockVerdict({ lockDate: lock, dates: ['2026-03-31'], role: 'ACCOUNTANT', reason: 'x'.repeat(10) }).ok).toBe(false)
  })

  it('checks every date a change touches (the old one and the new one)', () => {
    const edit = (dates: string[]) => lockVerdict({ lockDate: lock, dates, role: 'ACCOUNTANT', reason: null }).ok

    expect(edit(['2026-05-01', '2026-05-02'])).toBe(true)
    expect(edit(['2026-05-01', '2026-03-01'])).toBe(false)
    expect(edit(['2026-03-01', '2026-05-01'])).toBe(false)
  })

  it('lets only a company administrator in, and only with a reason', () => {
    const verdict = (role: string | null, reason: string | null) =>
      lockVerdict({ lockDate: new Date('2026-03-31T00:00:00Z'), dates: [new Date('2026-01-01T00:00:00Z')], role, reason })

    expect(verdict('SALES', 'late entry')).toMatchObject({ ok: false, error: expect.stringContaining('Only a company administrator') })
    expect(verdict(null, 'late entry').ok).toBe(false)
    expect(verdict('ADMIN', null)).toMatchObject({ ok: false, error: expect.stringContaining('Give a reason') })
    expect(verdict('ADMIN', '  ')).toMatchObject({ ok: false })
    expect(verdict('ADMIN', 'ok')).toMatchObject({ ok: false })
    expect(verdict('ADMIN', 'Late bank statement')).toEqual({ ok: true, overridden: true })
  })

  it('names the closing date in a readable way', () => {
    const verdict = lockVerdict({ lockDate: lock, dates: ['2026-01-01'], role: 'SALES', reason: null })

    expect(verdict.ok === false && verdict.error).toContain('31 Mar 2026')
  })

  it('demands a reason to delete, with the field named for the API', () => {
    expect(reasonVerdict(null, 'payment')).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } })
    expect(reasonVerdict('no', 'payment').ok).toBe(false)
    expect(reasonVerdict('Duplicate', 'payment').ok).toBe(true)
  })
})
