'use client'

import { useSyncExternalStore } from 'react'

const options: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

const noSubscription = () => () => {}

/**
 * A timestamp shown in the viewer's own timezone. While the page hydrates it
 * uses India time (identical on server and browser, so nothing mismatches),
 * then switches to the browser's timezone.
 */
export function LocalTime({
  value,
  withZone = false,
}: {
  value: string | Date
  withZone?: boolean
}) {
  const iso = (typeof value === 'string' ? new Date(value) : value).toISOString()

  const text = useSyncExternalStore(
    noSubscription,
    () =>
      new Intl.DateTimeFormat('en-IN', {
        ...options,
        ...(withZone ? { timeZoneName: 'short' as const } : {}),
      }).format(new Date(iso)),
    () =>
      new Intl.DateTimeFormat('en-IN', {
        ...options,
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso)),
  )

  return <time dateTime={iso}>{text}</time>
}
