import type { z } from 'zod'
import { money } from '@/lib/api/reads/format'
import type { compareResponse } from '@/lib/api/schemas/compare'
import { toneOf, type Change, type PeriodType } from '@/lib/compare-math'
import { getCompare } from '@/lib/queries/compare'
import { can } from '@/lib/permissions'
import type { UserRole } from '@/generated/prisma/enums'

/** Which comparison sources a role may read (the same gates the web page uses). */
export const compareAccess = (role: UserRole) => ({
  invoices: can(role, 'invoice:read'),
  payments: can(role, 'payment:read'),
  expenses: can(role, 'expense:read'),
  purchases: can(role, 'purchase:read'),
  orders: can(role, 'order:read'),
  customers: can(role, 'customer:read'),
})

export async function buildCompareResponse(
  role: UserRole,
  period: PeriodType,
  now = new Date(),
): Promise<z.infer<typeof compareResponse>> {
  const result = await getCompare(period, compareAccess(role), now)

  return {
    period: result.period,
    currency: 'INR',
    asOf: result.asOf,
    current: result.current,
    previous: result.previous,
    lastYear: result.lastYear,
    metrics: result.metrics.map((metric) => {
      // Counts are whole numbers; money is a two-place decimal string.
      const out = (value: number) => (metric.unit === 'money' ? money(value) : String(value))
      const change = (c: Change) => ({ abs: out(c.abs), pct: c.pct, kind: c.kind, tone: toneOf(c.kind, metric.good) })

      return {
        key: metric.key,
        label: metric.label,
        hint: metric.hint,
        unit: metric.unit,
        good: metric.good,
        basis: metric.basis,
        current: out(metric.current),
        previous: out(metric.previous),
        lastYear: out(metric.lastYear),
        vsPrevious: change(metric.vsPrevious),
        vsLastYear: change(metric.vsLastYear),
        series: metric.series.map((point) => ({
          start: point.start,
          label: point.label,
          value: out(point.value),
          lastYear: out(point.lastYear),
          partial: point.partial,
        })),
      }
    }),
  }
}
