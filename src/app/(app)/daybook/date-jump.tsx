'use client'

import { useRouter } from 'next/navigation'
import { DatePicker } from '@/components/catalyst/date-picker'

/** Jump straight to any day (or its month) in the day book. */
export function DateJump({ date, view, cashOnly }: { date: string; view: string; cashOnly: boolean }) {
  const router = useRouter()

  return (
    <DatePicker
      value={date}
      required
      aria-label="Go to date"
      onChange={(event) => {
        if (!event.target.value) return
        const query = new URLSearchParams({ view, date: event.target.value })
        if (cashOnly) query.set('mode', 'cash')
        router.push(`/daybook?${query}`)
      }}
    />
  )
}
