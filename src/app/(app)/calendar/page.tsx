import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import {
  addDays,
  isDayKey,
  istDayKey,
  monthRange,
  weekDays,
} from '@/lib/calendar'
import { can } from '@/lib/permissions'
import { listCalendarEntries } from '@/lib/queries/calendar'
import { getActiveIndustry, getCompanySetting } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { CalendarView } from './calendar-view'

export const metadata: Metadata = {
  title: 'Calendar',
}

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const user = await requireCapability('order:read')
  const query = await searchParams
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value

  const todayKey = istDayKey(new Date())
  const requestedDate = first(query.date)
  const dateKey = isDayKey(requestedDate) ? requestedDate : todayKey
  const view = first(query.view) === 'week' ? 'week' : 'month'
  const includeCancelled = first(query.cancelled) === '1'

  const range =
    view === 'week'
      ? { from: weekDays(dateKey)[0], to: addDays(weekDays(dateKey)[6], 1) }
      : monthRange(dateKey)

  const [industry, company, entries] = await Promise.all([
    getActiveIndustry(),
    getCompanySetting(),
    listCalendarEntries({ fromKey: range.from, toKey: range.to, includeCancelled }),
  ])

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Calendar</Heading>
        <Text>
          {industry.terms.orders} by the day they happen, with what has been paid so far.
          {' '}Anything without a start time is placed on its due date.
        </Text>
      </div>

      <CalendarView
        entries={entries}
        view={view}
        dateKey={dateKey}
        todayKey={todayKey}
        includeCancelled={includeCancelled}
        canCreate={can(user.role, 'order:create')}
        term={industry.terms.order}
        terms={industry.terms.orders}
        companyName={company.companyName}
      />
    </div>
  )
}
