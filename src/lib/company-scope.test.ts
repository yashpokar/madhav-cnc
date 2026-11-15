import { beforeEach, describe, expect, it, vi } from 'vitest'

const scope = vi.hoisted(() => ({
  value: { kind: 'company', companyId: 'c1' } as
    | { kind: 'company'; companyId: string }
    | { kind: 'open' }
    | { kind: 'none' },
}))

vi.mock('@/lib/active-company', () => ({ getCompanyScope: async () => scope.value }))

import { withCompanyScope } from '@/lib/company-scope'

const counts: Record<string, number> = {}
const countCalls: { model: string; where: unknown }[] = []

function makeBase() {
  const delegate = (model: string) => ({
    count: async ({ where }: { where: unknown }) => {
      countCalls.push({ model, where })

      return counts[model] ?? 0
    },
  })

  let handler: (input: unknown) => Promise<unknown>

  return {
    $extends: (ext: {
      query: { $allModels: { $allOperations: (input: unknown) => Promise<unknown> } }
    }) => {
      handler = ext.query.$allModels.$allOperations

      return { run: (input: unknown) => handler(input) }
    },
    customer: delegate('Customer'),
    item: delegate('Item'),
    order: delegate('Order'),
    quotationAttachment: delegate('QuotationAttachment'),
  }
}

async function run(model: string, operation: string, args: unknown) {
  const base = makeBase()
  const client = withCompanyScope(base as never) as unknown as {
    run: (input: unknown) => Promise<unknown>
  }
  const query = vi.fn(async (a: unknown) => a)

  const result = client.run({ model, operation, args, query })

  return { result, query }
}

beforeEach(() => {
  scope.value = { kind: 'company', companyId: 'c1' }
  countCalls.length = 0

  for (const key of Object.keys(counts)) delete counts[key]
})

describe('company scope extension', () => {
  it('passes global models straight through', async () => {
    const { result, query } = await run('User', 'findMany', { where: { id: 'u' } })

    await result
    expect(query).toHaveBeenCalledWith({ where: { id: 'u' } })
  })

  it('filters a scoped read by the active company', async () => {
    const { result } = await run('Customer', 'findMany', { where: { name: 'a' } })

    expect(await result).toEqual({ where: { name: 'a', companyId: 'c1' } })
  })

  it('filters a child by its parent company', async () => {
    const { result } = await run('QuotationAttachment', 'findUnique', { where: { id: 'a' } })

    expect(await result).toEqual({
      where: { AND: [{ id: 'a' }, { quotation: { companyId: 'c1' } }] },
    })
  })

  it('stamps creates and accepts a customer of the same company', async () => {
    counts.Customer = 1

    const { result } = await run('Order', 'create', { data: { customerId: 'cu' } })

    expect(await result).toEqual({ data: { companyId: 'c1', customerId: 'cu' } })
    expect(countCalls[0]).toEqual({
      model: 'Customer',
      where: { id: { in: ['cu'] }, companyId: 'c1' },
    })
  })

  it('refuses to attach a customer, or a nested item, from another company', async () => {
    counts.Customer = 0

    const { result, query } = await run('Order', 'create', { data: { customerId: 'foreign' } })

    await expect(result).rejects.toThrow('not found in this company')
    expect(query).not.toHaveBeenCalled()

    counts.Customer = 1
    counts.Item = 0

    const nested = await run('Order', 'create', {
      data: { customerId: 'cu', lines: { create: [{ itemId: 'foreign' }] } },
    })

    await expect(nested.result).rejects.toThrow('not found in this company')
  })

  it('checks a child parent id on create (a comment on another company quotation)', async () => {
    const { result } = await run('QuotationAttachment', 'create', {
      data: { quotationId: 'foreignQuotation' },
    })

    await expect(result).rejects.toThrow()
  })

  it('refuses to move a row to another company', async () => {
    const { result } = await run('Customer', 'update', {
      where: { id: 'x' },
      data: { companyId: 'c2' },
    })

    await expect(result).rejects.toThrow('another company')
  })

  it('does not filter public requests (nobody signed in)', async () => {
    scope.value = { kind: 'open' }

    const { result } = await run('Quotation', 'findUnique', { where: { id: 'q' } })

    expect(await result).toEqual({ where: { id: 'q' } })
  })

  it('shows a signed-in person with no company nothing at all', async () => {
    scope.value = { kind: 'none' }

    const { result } = await run('Invoice', 'findMany', { where: {} })

    expect(await result).toEqual({ where: { companyId: '__no_company__' } })

    const child = await run('InvoiceLine', 'findMany', {})

    expect(await child.result).toEqual({
      where: { AND: [{}, { invoice: { companyId: '__no_company__' } }] },
    })
  })

  it('does not stamp a company onto creates by a person with no company', async () => {
    scope.value = { kind: 'none' }

    const { result } = await run('Partner', 'create', { data: { name: 'p' } })

    expect(await result).toEqual({ data: { name: 'p' } })
  })
})
