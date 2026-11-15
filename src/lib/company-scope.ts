import type { withAudit } from '@/lib/audit'
import { getCompanyScope } from '@/lib/active-company'
import {
  NO_COMPANY,
  SCOPED,
  collectRefs,
  groupRefs,
  isCompanyOwned,
  ownedBy,
  scopeWhere,
  stampCreate,
  writtenData,
} from '@/lib/tenant-rules'

type Args = Parameters<typeof stampCreate>[1]

type Counter = { count: (args: { where: unknown }) => Promise<number> }

/**
 * Keeps every query inside the active company: reads and changes only see its
 * rows (children through their parent), new rows are filed under it, and a
 * write may only point at records of that company (a customer, item, order...
 * from another company is refused). This is the one place that knows about
 * companies, so no action or page can forget to filter. The activity log also
 * shows entries that belong to no company (people being added, say).
 *
 * Nobody signed in (public token links, seed scripts) is not filtered; those
 * routes look rows up by an unguessable token. A signed-in person with no
 * company sees nothing.
 */
export function withCompanyScope(base: ReturnType<typeof withAudit>) {
  async function assertOwned(model: string, ids: string[], companyId: string) {
    const where = { id: { in: ids }, ...ownedBy(model, companyId) }
    const delegate = (base as unknown as Record<string, Counter>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ]

    if ((await delegate.count({ where })) !== ids.length) {
      throw new Error('That record was not found in this company')
    }
  }

  return base.$extends({
    name: 'company-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isCompanyOwned(model)) return query(args)

          const scope = await getCompanyScope()

          if (scope.kind === 'open') return query(args)

          const companyId = scope.kind === 'company' ? scope.companyId : NO_COMPANY
          let next = { ...(args as Args) }

          const where = scopeWhere(model, operation, next.where, companyId)

          if (where !== next.where) next.where = where

          if (SCOPED.has(model)) {
            // A person with no company creates nothing by accident: the row
            // has no company, so the foreign key refuses it.
            if (scope.kind === 'company') next = stampCreate(operation, next, companyId)

            const data = next.data as { companyId?: unknown } | undefined

            if (
              operation.startsWith('update') &&
              data &&
              typeof data.companyId === 'string' &&
              data.companyId !== companyId
            ) {
              throw new Error('A record can not be moved to another company')
            }
          }

          const refs = writtenData(operation, next).flatMap((data) => collectRefs(model, data))

          for (const [target, ids] of groupRefs(refs)) {
            await assertOwned(target, ids, companyId)
          }

          return query(next as typeof args)
        },
      },
    },
  })
}
