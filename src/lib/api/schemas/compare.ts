import { z } from 'zod'
import { dateOnly } from '@/lib/api/schemas/reads'

// GET /reports/compare: week over week, month over month, year over year.
// Money is a decimal string ("12345.50"), counts are integer strings.

export const COMPARE_PERIODS = ['week', 'month', 'year'] as const

export const compareQuery = z.object({
  period: z.enum(COMPARE_PERIODS).describe('Weeks are ISO (Monday first); a year is the calendar year, India time'),
})

const compareChange = z.object({
  abs: z.string().describe('Current minus the comparison figure (money for money metrics, a whole number for counts)'),
  pct: z
    .number()
    .nullable()
    .describe('Percent of the comparison figure, one decimal; null when it was 0 (see kind)'),
  kind: z
    .enum(['up', 'down', 'flat', 'new'])
    .describe('"new": there was nothing to compare with, show the word instead of a percent'),
  tone: z.enum(['good', 'bad', 'neutral']).describe('Whether this move is good news for this metric (more expenses is bad)'),
})

const comparePoint = z.object({
  start: dateOnly.describe('First day of the period'),
  label: z.string(),
  value: z.string(),
  lastYear: z.string().describe('The same period one year earlier'),
  partial: z.boolean().describe('True for the period still in progress'),
})

export const compareMetric = z.object({
  key: z.enum([
    'sales',
    'collections',
    'expenses',
    'purchases',
    'profit',
    'newCustomers',
    'orders',
    'invoices',
    'receivables',
  ]),
  label: z.string(),
  hint: z.string(),
  unit: z.enum(['money', 'count']),
  good: z.enum(['up', 'down', 'neutral']).describe('Which direction is good news'),
  basis: z.enum(['flow', 'stock']).describe('A flow adds up inside the period; a stock is a balance at its end'),
  current: z.string().describe('The period so far'),
  previous: z.string().describe('The same number of days into the period before'),
  lastYear: z.string().describe('The same number of days into the same period a year earlier'),
  vsPrevious: compareChange,
  vsLastYear: compareChange,
  series: z
    .array(comparePoint)
    .describe('The last 12 periods, oldest first; each carries its year-earlier value for the overlay'),
})

const compareSpan = z.object({ from: dateOnly, to: dateOnly, label: z.string() })

export const compareResponse = z.object({
  period: z.enum(COMPARE_PERIODS),
  currency: z.literal('INR'),
  asOf: dateOnly.describe('Today, India time'),
  current: compareSpan.extend({
    elapsedDays: z.number().int(),
    totalDays: z.number().int(),
  }),
  previous: compareSpan.describe('The slice compared against (same days into the previous period)'),
  lastYear: compareSpan.describe('The slice compared against (same days into the period a year ago)'),
  metrics: z
    .array(compareMetric)
    .describe(
      'Only the metrics the role may read: sales, invoices and receivables need invoice:read (receivables also payment:read); collections payment:read; expenses expense:read; purchases purchase:read; orders order:read; newCustomers customer:read; profit payment:read and expense:read',
    ),
})
