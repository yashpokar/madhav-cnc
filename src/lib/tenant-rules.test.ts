import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHILD_PARENT,
  NO_COMPANY,
  RELATION_TABLE,
  SCOPED,
  collectRefs,
  foreignKeys,
  groupRefs,
  isCompanyOwned,
  ownedBy,
  scopeWhere,
  stampCreate,
  writtenData,
} from '@/lib/tenant-rules'

const GLOBAL = new Set([
  'User',
  'Session',
  'Account',
  'Verification',
  'CompanySetting',
  'UserCompany',
  'DocumentCounter',
])

const schema = readFileSync('prisma/schema.prisma', 'utf8')

function parseSchema() {
  const models: string[] = []
  const relations: Record<string, Record<string, { target: string; fk?: string }>> = {}
  const owned = (name: string) => SCOPED.has(name) || name in CHILD_PARENT
  let current: string | null = null

  for (const line of schema.split('\n')) {
    const model = line.match(/^model (\w+)/)

    if (model) {
      current = model[1]
      models.push(current)
      continue
    }

    if (!current || !owned(current)) continue

    const field = line.match(/^\s+(\w+)\s+(\w+)(\[\])?\??\s*(@relation.*)?$/)

    if (!field || !owned(field[2])) continue

    const [, name, target, list, relation] = field
    const fk = (relation ?? '').match(/fields: \[(\w+)\]/)

    relations[current] ??= {}

    if (list) relations[current][name] = { target }
    else if (fk) relations[current][name] = { target, fk: fk[1] }
  }

  return { models, relations }
}

describe('schema classification', () => {
  const { models, relations } = parseSchema()

  it('puts every model in exactly one of scoped, child or global', () => {
    for (const model of models) {
      const kinds = [SCOPED.has(model), model in CHILD_PARENT, GLOBAL.has(model)]

      expect(kinds.filter(Boolean), `${model} must be classified once`).toHaveLength(1)
    }
  })

  it('has a companyId column on every scoped model and none on child models', () => {
    for (const model of models) {
      const body = schema.split(`model ${model} {`)[1].split('\n}')[0]
      const hasCompany = /^\s+companyId\s/m.test(body)

      if (SCOPED.has(model)) expect(hasCompany, model).toBe(true)

      if (model in CHILD_PARENT) expect(hasCompany, model).toBe(false)
    }
  })

  it('walks every child up to a scoped model through real relations', () => {
    for (const [child, path] of Object.entries(CHILD_PARENT)) {
      let model = child

      for (const relation of path) {
        const next = relations[model]?.[relation]

        expect(next, `${model}.${relation}`).toBeDefined()
        model = next.target
      }

      expect(SCOPED.has(model), `${child} ends at ${model}`).toBe(true)
    }
  })

  it('keeps the relation table in step with the schema', () => {
    expect(RELATION_TABLE).toEqual(relations)
  })
})

describe('ownedBy', () => {
  it('is a plain companyId for a scoped model', () => {
    expect(ownedBy('Invoice', 'c1')).toEqual({ companyId: 'c1' })
  })

  it('goes through the parent for a child, however deep', () => {
    expect(ownedBy('InvoiceLine', 'c1')).toEqual({ invoice: { companyId: 'c1' } })
    expect(ownedBy('QuotationShareResponse', 'c1')).toEqual({
      share: { quotation: { companyId: 'c1' } },
    })
  })

  it('is null for global models', () => {
    expect(ownedBy('User', 'c1')).toBeNull()
    expect(isCompanyOwned('CompanySetting')).toBe(false)
  })
})

describe('scopeWhere', () => {
  it('adds the company to a scoped read and keeps the caller filter', () => {
    expect(scopeWhere('Customer', 'findMany', { name: 'a' }, 'c1')).toEqual({
      name: 'a',
      companyId: 'c1',
    })
    expect(scopeWhere('Customer', 'findUnique', { id: 'x' }, 'c1')).toEqual({
      id: 'x',
      companyId: 'c1',
    })
  })

  it('scopes a read with no filter at all', () => {
    expect(scopeWhere('Customer', 'count', undefined, 'c1')).toEqual({ companyId: 'c1' })
  })

  it('trusts a where that already names a company (public links)', () => {
    expect(scopeWhere('PaymentChannel', 'findFirst', { id: 'q', companyId: 'c9' }, 'c1')).toEqual({
      id: 'q',
      companyId: 'c9',
    })
  })

  it('scopes a child through its parent without clobbering a relation filter', () => {
    expect(
      scopeWhere('ProductionTask', 'findMany', { order: { status: 'READY' } }, 'c1'),
    ).toEqual({ order: { status: 'READY' }, AND: [{ order: { companyId: 'c1' } }] })
  })

  it('keeps the unique id at the top level for a child looked up by id', () => {
    // Prisma only accepts a unique lookup when the id is a top-level key.
    expect(scopeWhere('QuotationAttachment', 'findUnique', { id: 'a' }, 'c1')).toEqual({
      id: 'a',
      AND: [{ quotation: { companyId: 'c1' } }],
    })
    expect(scopeWhere('OrderLine', 'update', { id: 'l', AND: [{ notes: 'x' }] }, 'c1')).toEqual({
      id: 'l',
      AND: [{ notes: 'x' }, { order: { companyId: 'c1' } }],
    })
  })

  it('covers mutations too', () => {
    for (const op of ['update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      expect(scopeWhere('InvoiceLine', op, { invoiceId: 'i' }, 'c1')).toBeDefined()
      expect(scopeWhere('InvoiceLine', op, { invoiceId: 'i' }, 'c1')).toHaveProperty('AND')
    }
  })

  it('also shows company-less activity entries, except on upsert', () => {
    expect(scopeWhere('ActivityLog', 'findMany', { entityId: 'e' }, 'c1')).toEqual({
      entityId: 'e',
      AND: [{ OR: [{ companyId: 'c1' }, { companyId: null }] }],
    })
  })

  it('never matches anything for a person with no company', () => {
    expect(scopeWhere('Invoice', 'findMany', {}, NO_COMPANY)).toEqual({ companyId: NO_COMPANY })
  })

  it('leaves creates and global models alone', () => {
    expect(scopeWhere('Customer', 'create', undefined, 'c1')).toBeUndefined()
    expect(scopeWhere('User', 'findMany', { id: 'u' }, 'c1')).toEqual({ id: 'u' })
  })
})

describe('stampCreate', () => {
  it('files new rows under the company, but lets an explicit companyId win', () => {
    expect(stampCreate('create', { data: { name: 'a' } }, 'c1').data).toEqual({
      companyId: 'c1',
      name: 'a',
    })
    expect(stampCreate('create', { data: { name: 'a', companyId: 'c2' } }, 'c1').data).toEqual({
      companyId: 'c2',
      name: 'a',
    })
  })

  it('stamps every row of createMany and the create side of upsert', () => {
    expect(stampCreate('createMany', { data: [{ a: 1 }, { a: 2 }] }, 'c1').data).toEqual([
      { companyId: 'c1', a: 1 },
      { companyId: 'c1', a: 2 },
    ])
    expect(stampCreate('upsert', { create: { a: 1 } }, 'c1').create).toEqual({
      companyId: 'c1',
      a: 1,
    })
  })
})

describe('foreignKeys and collectRefs', () => {
  it('lists the foreign keys of a model', () => {
    expect(foreignKeys('Quotation')).toMatchObject({
      customerId: 'Customer',
      architectId: 'Partner',
      parentId: 'Quotation',
    })
    expect(foreignKeys('User')).toEqual({})
  })

  it('finds plain foreign-key columns', () => {
    expect(collectRefs('Order', { customerId: 'c', subject: 's', createdById: 'u' })).toEqual([
      { model: 'Customer', id: 'c' },
    ])
  })

  it('finds ids inside nested line creates and createMany', () => {
    const refs = collectRefs('Invoice', {
      customerId: 'c',
      lines: { create: [{ itemId: 'i1' }, { itemId: 'i2', description: 'x' }] },
      paymentAllocations: { createMany: { data: [{ paymentId: 'p' }] } },
    })

    expect(refs).toEqual(
      expect.arrayContaining([
        { model: 'Customer', id: 'c' },
        { model: 'Item', id: 'i1' },
        { model: 'Item', id: 'i2' },
        { model: 'Payment', id: 'p' },
      ]),
    )
  })

  it('finds relation connects, set values, and nested updates', () => {
    expect(collectRefs('Order', { customer: { connect: { id: 'c' } } })).toEqual([
      { model: 'Customer', id: 'c' },
    ])
    expect(collectRefs('Order', { customerId: { set: 'c' } })).toEqual([
      { model: 'Customer', id: 'c' },
    ])
    expect(
      collectRefs('Order', { lines: { update: { where: { id: 'l' }, data: { itemId: 'i' } } } }),
    ).toEqual([{ model: 'Item', id: 'i' }])
  })

  it('refuses a connect it can not check', () => {
    expect(collectRefs('Order', { customer: { connect: { code: 'X' } } })).toEqual([
      { model: 'Customer', id: '__unverifiable__' },
    ])
  })

  it('ignores null, undefined and non-string values', () => {
    expect(collectRefs('Order', { customerId: undefined, architectId: null })).toEqual([])
  })

  it('groups distinct ids per company-owned target and skips global tables', () => {
    const grouped = groupRefs([
      { model: 'Item', id: 'a' },
      { model: 'Item', id: 'a' },
      { model: 'Item', id: 'b' },
      { model: 'User', id: 'u' },
    ])

    expect(grouped.get('Item')).toEqual(['a', 'b'])
    expect(grouped.has('User')).toBe(false)
  })
})

describe('writtenData', () => {
  it('reads the data side of each write', () => {
    expect(writtenData('create', { data: 1 })).toEqual([1])
    expect(writtenData('findMany', { data: 1 })).toEqual([])
    expect(writtenData('upsert', { create: { a: 1 }, update: { b: 2 } } as never)).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })
})

describe('balance adjustments', () => {
  it('are scoped to a company, stamped on create and filtered on read', () => {
    expect(SCOPED.has('BalanceAdjustment')).toBe(true)
    expect(ownedBy('BalanceAdjustment', 'c1')).toEqual({ companyId: 'c1' })
    expect(scopeWhere('BalanceAdjustment', 'findMany', { kind: 'CUSTOMER' }, 'c1')).toEqual({
      kind: 'CUSTOMER',
      companyId: 'c1',
    })
    expect(stampCreate('create', { data: { number: 'ADJ-0001' } }, 'c1').data).toEqual({
      companyId: 'c1',
      number: 'ADJ-0001',
    })
  })

  it('must point at a payment mode and a customer of the same company', () => {
    expect(foreignKeys('BalanceAdjustment')).toEqual({
      channelId: 'PaymentChannel',
      customerId: 'Customer',
    })
    expect(
      groupRefs(collectRefs('BalanceAdjustment', { channelId: 'ch1', customerId: null })).get(
        'PaymentChannel',
      ),
    ).toEqual(['ch1'])
  })
})
