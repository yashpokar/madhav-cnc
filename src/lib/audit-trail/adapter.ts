import type { PrismaPg } from '@prisma/adapter-pg'
import { currentAuditPayload } from '@/lib/audit-trail/context'

/**
 * Hands the audit context to the database, in the same transaction as the
 * change. Wraps the Prisma driver adapter: before any statement that writes
 * (INSERT/UPDATE/DELETE, including raw SQL, nested writes and createMany), it
 * sets the transaction-local setting `audit.ctx`, which the audit triggers
 * read. A write outside a transaction is run in one of its own, so the setting
 * and the change share a connection and a commit.
 *
 * Why here and not in a query extension: this layer sees EVERY statement, also
 * the ones Prisma generates for nested writes, batch transactions and raw SQL,
 * and it holds the very connection the change uses. An extension sees only the
 * top-level call. The tenant extension (company-scope.ts) still wraps the
 * client above this; the two are independent.
 */

// The adapter types come from the PrismaPg factory itself (the driver-adapter
// package is not a direct dependency).
type SqlDriverAdapterFactory = InstanceType<typeof PrismaPg>
type SqlDriverAdapter = Awaited<ReturnType<SqlDriverAdapterFactory['connect']>>
type Transaction = Awaited<ReturnType<SqlDriverAdapter['startTransaction']>>
type SqlQuery = Parameters<SqlDriverAdapter['queryRaw']>[0]

const WRITE = /^\s*\(?\s*(insert|update|delete|merge|with)\b/i

const COMMIT: SqlQuery = { sql: 'COMMIT', args: [], argTypes: [] }
const ROLLBACK: SqlQuery = { sql: 'ROLLBACK', args: [], argTypes: [] }

const SET_CONTEXT: SqlQuery = {
  sql: `SELECT set_config('audit.ctx', $1, true)`,
  args: [],
  argTypes: [{ scalarType: 'string', arity: 'scalar' }],
}

export const isWriteStatement = (sql: string) => WRITE.test(sql)

async function contextStatement(): Promise<SqlQuery | null> {
  const payload = await currentAuditPayload()

  return payload ? { ...SET_CONTEXT, args: [JSON.stringify(payload)] } : null
}

type Queryable = Pick<SqlDriverAdapter, 'queryRaw' | 'executeRaw'>

/** Applies the context at most once per transaction (again only if it changed). */
function contextSetter(target: Queryable) {
  let applied: string | null = null

  return async () => {
    const statement = await contextStatement()
    const key = statement ? (statement.args[0] as string) : null

    if (key === applied) return

    // No context after one was set (not expected inside one request): clear it,
    // so the next change is not attributed to somebody else.
    await target.queryRaw(statement ?? { ...SET_CONTEXT, args: [''] })
    applied = key
  }
}

function wrapTransaction(tx: Transaction): Transaction {
  const apply = contextSetter(tx)

  return new Proxy(tx, {
    get(target, prop) {
      if (prop === 'queryRaw' || prop === 'executeRaw') {
        return async (query: SqlQuery) => {
          if (isWriteStatement(query.sql)) await apply()

          return target[prop](query)
        }
      }

      const value = Reflect.get(target, prop, target)

      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function wrapAdapter(adapter: SqlDriverAdapter): SqlDriverAdapter {
  const run = async <T>(
    method: 'queryRaw' | 'executeRaw',
    query: SqlQuery,
  ): Promise<T> => {
    if (!isWriteStatement(query.sql)) return adapter[method](query) as Promise<T>

    // A write outside a transaction: give it one, so the context and the
    // change are in the same transaction on the same connection.
    const tx = await adapter.startTransaction()

    try {
      const apply = contextSetter(tx)

      await apply()

      const result = (await tx[method](query)) as T

      // The pg driver's commit() only releases the connection: COMMIT and
      // ROLLBACK are statements the caller sends (as Prisma does for its own).
      await tx.executeRaw(COMMIT)
      await tx.commit()

      return result
    } catch (error) {
      await tx.executeRaw(ROLLBACK).catch(() => undefined)
      await tx.rollback().catch(() => undefined)
      throw error
    }
  }

  return new Proxy(adapter, {
    get(target, prop) {
      if (prop === 'queryRaw') return (query: SqlQuery) => run('queryRaw', query)
      if (prop === 'executeRaw') return (query: SqlQuery) => run('executeRaw', query)
      if (prop === 'startTransaction') {
        return async (isolationLevel?: Parameters<SqlDriverAdapter['startTransaction']>[0]) =>
          wrapTransaction(await target.startTransaction(isolationLevel))
      }

      const value = Reflect.get(target, prop, target)

      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Wraps a Prisma driver adapter factory (PrismaPg) so its writes carry the audit context. */
export function withAuditContext<F extends SqlDriverAdapterFactory>(factory: F): F {
  return new Proxy(factory, {
    get(target, prop) {
      if (prop === 'connect' || prop === 'connectToShadowDb') {
        const original = Reflect.get(target, prop, target) as (() => Promise<SqlDriverAdapter>) | undefined

        return original ? async () => wrapAdapter(await original.call(target)) : undefined
      }

      const value = Reflect.get(target, prop, target)

      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as F
}
