import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request state for the mobile API. getCompanyScope() reads it: when a
 * store exists, its companyId is the active company (instead of the web
 * cookie), and a store with no companyId means "no company" rather than
 * "first company". Web requests never have a store.
 *
 * AsyncLocalStorage keeps concurrent requests apart, so two phones working in
 * two different companies at once can not see each other's data.
 */
export type RequestContext = { companyId?: string }

// Kept on globalThis: the bundler can load this file more than once (a route's
// own copy beside the one the Prisma client was built with, which survives hot
// reloads on globalThis). Two stores would leave the database layer blind to
// the company the handler set, and it would then fall back to the first company.
const shared = globalThis as { __prodlysRequestContext?: AsyncLocalStorage<RequestContext> }

export const requestContext = (shared.__prodlysRequestContext ??= new AsyncLocalStorage<RequestContext>())

export function runInRequestContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return requestContext.run(context, fn)
}
