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

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function runInRequestContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return requestContext.run(context, fn)
}
