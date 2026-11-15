import type { z } from 'zod'
import { day, money, todayIndia } from '@/lib/api/reads/format'
import type { dashboardSummary } from '@/lib/api/schemas/reads'
import { addDays, istDayKey } from '@/lib/calendar'
import { can } from '@/lib/permissions'
import { listCalendarEntries, type CalendarEntry } from '@/lib/queries/calendar'
import { getOrderWatch, getPeriodActivity } from '@/lib/queries/dashboard'
import { getPayables } from '@/lib/queries/payables'
import { getReceivables } from '@/lib/queries/receivables'
import { countLowStock } from '@/lib/queries/stock'
import type { UserRole } from '@/generated/prisma/enums'

const DAY = 86_400_000

const booking = (entry: CalendarEntry) => ({
  id: entry.id,
  number: entry.number,
  status: entry.status,
  customerName: entry.customerName,
  venue: entry.venue,
  startsAt: entry.startsAt,
  dueDate: entry.dueDate ? entry.dueDate.slice(0, 10) : null,
})

/**
 * What the app's home screen shows, mirroring src/app/(app)/page.tsx: each block
 * is computed only when the role may read what it shows (otherwise null), using
 * the same queries as the web dashboard. "This month" is the 1st of the India
 * month to today.
 */
export async function buildDashboardSummary(
  role: UserRole,
  now = new Date(),
): Promise<z.infer<typeof dashboardSummary>> {
  const canMoney = can(role, 'invoice:read')
  const canExpenses = can(role, 'expense:read')
  const canOrders = can(role, 'order:read')

  const today = todayIndia(now)
  const monthFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const days = Math.round((today.getTime() - monthFrom.getTime()) / DAY) + 1
  const prevTo = new Date(monthFrom.getTime() - DAY)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY)
  const todayKey = istDayKey(now)

  const [receivables, activity, orderWatch, todays, upcoming, lowStock, payables] = await Promise.all([
    canMoney ? getReceivables(now) : null,
    canMoney || canExpenses
      ? getPeriodActivity(
          { from: monthFrom, to: today, prev: { from: prevFrom, to: prevTo } },
          { money: canMoney, expenses: canExpenses, orders: false, quotes: false },
        )
      : null,
    canOrders ? getOrderWatch() : null,
    canOrders ? listCalendarEntries({ fromKey: todayKey, toKey: addDays(todayKey, 1), includeCancelled: false }) : null,
    canOrders
      ? listCalendarEntries({ fromKey: addDays(todayKey, 1), toKey: addDays(todayKey, 8), includeCancelled: false })
      : null,
    can(role, 'stock:read') ? countLowStock() : null,
    can(role, 'purchase:read') ? getPayables(now) : null,
  ])

  const current = activity?.current

  return {
    currency: 'INR',
    asOf: day(today),
    month: { from: day(monthFrom), to: day(today) },
    receivables: receivables
      ? {
          outstanding: money(receivables.outstanding),
          overdue: money(receivables.overdue),
          totalDue: money(receivables.totalDue),
        }
      : null,
    billedThisMonth: canMoney && current ? { total: money(current.billed), count: current.billedCount } : null,
    paymentsReceivedThisMonth:
      canMoney && current ? { total: money(current.received), count: current.receivedCount } : null,
    expensesThisMonth: canExpenses && current ? { total: money(current.spent) } : null,
    bookings:
      todays && upcoming
        ? {
            today: todays.map(booking),
            next7Days: { count: upcoming.length, items: upcoming.slice(0, 20).map(booking) },
          }
        : null,
    orders: orderWatch
      ? {
          open: orderWatch.openCount,
          overdue: orderWatch.overdue,
          dueSoon: orderWatch.dueThisWeek,
          readyToDispatch: orderWatch.readyToDispatch,
        }
      : null,
    lowStockCount: lowStock,
    payablesTotal: payables ? money(payables.totalPayable) : null,
  }
}
