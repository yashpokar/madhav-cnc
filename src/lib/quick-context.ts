import { useSyncExternalStore } from 'react'

/**
 * What the command palette needs to know about the signed-in person, published
 * by the Shortcuts component so the app shell only mounts one element.
 */
export type QuickContext = {
  userId: string | null
  companyId: string | null
  /** Keys of CREATE_ACTIONS this person may use. */
  allowed: readonly string[]
  /** The industry's word for one order: Order, Booking, Event... */
  orderTerm: string
}

let current: QuickContext = { userId: null, companyId: null, allowed: [], orderTerm: 'Order' }
const listeners = new Set<() => void>()

export function setQuickContext(next: QuickContext) {
  const same =
    next.userId === current.userId &&
    next.companyId === current.companyId &&
    next.orderTerm === current.orderTerm &&
    next.allowed.join() === current.allowed.join()

  if (same) return

  current = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useQuickContext(): QuickContext {
  return useSyncExternalStore(subscribe, () => current, () => current)
}
