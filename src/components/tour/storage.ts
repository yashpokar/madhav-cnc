export type TourState = 'done' | 'skipped'

export const tourKey = (userId: string, companyId: string) => `tour:v1:${userId}:${companyId}`

/** `undefined` means storage is unavailable, so callers can avoid nagging with no way to remember. */
export function readTourState(userId: string, companyId: string): TourState | null | undefined {
  try {
    const value = window.localStorage.getItem(tourKey(userId, companyId))
    return value === 'done' || value === 'skipped' ? value : null
  } catch {
    return undefined
  }
}

export function writeTourState(userId: string, companyId: string, state: TourState) {
  try {
    window.localStorage.setItem(tourKey(userId, companyId), state)
  } catch {
    // Private mode or blocked storage: the tour simply may show again next time.
  }
}
