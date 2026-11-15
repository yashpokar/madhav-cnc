import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import {
  addDays,
  isDayKey,
  istDayKey,
  monthRange,
  parseLayers,
  type LayerKey,
  weekDays,
} from '@/lib/calendar'
import { can } from '@/lib/permissions'
import { listCalendarItems } from '@/lib/queries/calendar'
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

  // Each layer needs its own read permission; a layer you cannot read is never loaded.
  const allowed: LayerKey[] = [
    ...(can(user.role, 'order:read') ? (['orders'] as const) : []),
    ...(can(user.role, 'dispatch:read') ? (['deliveries'] as const) : []),
    ...(can(user.role, 'invoice:read') ? (['invoices'] as const) : []),
    ...(can(user.role, 'payment:read') ? (['payments'] as const) : []),
  ]
  const layersRaw = first(query.layers)
  const layers = parseLayers(layersRaw ?? null, allowed)

  const range =
    view === 'week'
      ? { from: weekDays(dateKey)[0], to: addDays(weekDays(dateKey)[6], 1) }
      : monthRange(dateKey)

  const [industry, company, entries] = await Promise.all([
    getActiveIndustry(),
    getCompanySetting(),
    listCalendarItems({ fromKey: range.from, toKey: range.to, includeCancelled, layers }),
  ])

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Calendar</Heading>
        <Text>
          {industry.terms.orders} by the day they happen, with deliveries, invoices falling due and
          payments received. An order with no start time sits on its due date, or its order date.
        </Text>
      </div>

      <CalendarView
        entries={entries}
        layers={layers}
        allowedLayers={allowed}
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
