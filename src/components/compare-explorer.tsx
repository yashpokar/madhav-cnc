'use client'

import { useState } from 'react'
import { Sparkline } from '@/components/charts/sparkline'
import { TrendChart } from '@/components/charts/trend-chart'
import { Select } from '@/components/catalyst/select'
import { Subheading } from '@/components/catalyst/heading'
import { EmptyState } from '@/components/form-banner'
import type { CompareResult, MetricResult } from '@/lib/compare-build'
import { toneOf, type Change } from '@/lib/compare-math'

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const count = new Intl.NumberFormat('en-IN')

const signedMoney = (value: number) => (value < 0 ? `−${whole.format(-value)}` : whole.format(value))

function fmt(metric: Pick<MetricResult, 'unit'>, value: number) {
  return metric.unit === 'money' ? signedMoney(value) : count.format(value)
}

const fmtAxis = (metric: Pick<MetricResult, 'unit'>, value: number) =>
  metric.unit === 'money' ? `${value < 0 ? '−' : ''}₹${compact.format(Math.abs(value))}` : compact.format(value)

const TONE = {
  good: 'text-lime-700 dark:text-lime-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-zinc-600 dark:text-zinc-300',
} as const

/**
 * "▲ 12.5%" / "▼ 8%" / "New" / "No change". The arrow and the words carry the
 * direction; the colour only says whether it is good news for this metric.
 */
function ChangeCell({ change, metric }: { change: Change; metric: MetricResult }) {
  const tone = toneOf(change.kind, metric.good)
  const goodWord = tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : ''
  let text: string
  let spoken: string

  if (change.kind === 'new') {
    text = 'New'
    spoken = 'New, nothing to compare with'
  } else if (change.kind === 'flat') {
    text = change.pct === null ? '–' : 'No change'
    spoken = 'No change'
  } else {
    const pct = `${Math.abs(change.pct ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`

    text = `${change.kind === 'up' ? '▲' : '▼'} ${pct}`
    spoken = `${change.kind === 'up' ? 'Up' : 'Down'} ${pct}${goodWord ? `, ${goodWord}` : ''}`
  }

  return (
    <span className={`inline-flex items-center gap-1 text-sm/5 font-medium whitespace-nowrap tabular-nums ${TONE[tone]}`}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

function trendLabel(metric: MetricResult) {
  const values = metric.series.map((point) => point.value).join(', ')

  return `${metric.label} over the last ${metric.series.length} periods: ${values}`
}

/** Finished periods only: a half-finished one would always look like a drop. */
const doneValues = (metric: MetricResult) => trim(metric.series).filter((point) => !point.partial).map((point) => point.value)

/** Drops leading periods with no data at all (before the company started), keeping at least four. */
function trim(series: MetricResult['series']) {
  let first = 0

  while (first < series.length - 4 && series[first].value === 0 && series[first].lastYear === 0) first += 1

  return series.slice(first)
}

export function CompareExplorer({ data }: { data: CompareResult }) {
  const [selected, setSelected] = useState(data.metrics[0]?.key)
  const [asTable, setAsTable] = useState(false)
  const metric = data.metrics.find((m) => m.key === selected) ?? data.metrics[0]
  const noun = data.period
  const showYear = noun !== 'year' // for a year, "last year" is the previous period
  const empty = data.metrics.every((m) => m.series.every((p) => p.value === 0 && p.lastYear === 0))

  if (!metric || empty) {
    return (
      <EmptyState
        title="Nothing to compare yet"
        description={`Once you issue invoices, receive payments or record expenses, this page compares each ${noun} with the one before and with last year.`}
      />
    )
  }

  const heads = {
    current: `This ${noun}`,
    previous: 'Previous',
    lastYear: 'Last year',
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section aria-label="Comparison" className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 pt-4 pb-3 sm:px-5">
          <Subheading level={2}>Comparison</Subheading>
          <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">
            {data.current.label} so far ({data.current.elapsedDays} of {data.current.totalDays} days), against the same days of each
          </span>
        </div>

        <div className="hidden md:block">
          <table className="w-full text-left">
            <caption className="sr-only">
              {data.current.label} so far compared with {data.previous.label} and {data.lastYear.label}
            </caption>
            <thead>
              <tr className="border-y border-zinc-950/5 text-xs/5 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Metric</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {heads.current}
                  <span className="block font-normal">{data.current.label}</span>
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {heads.previous}
                  <span className="block font-normal">{data.previous.label}</span>
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Change</th>
                {showYear ? (
                  <>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {heads.lastYear}
                      <span className="block font-normal">{data.lastYear.label}</span>
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Change</th>
                  </>
                ) : null}
                <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => (
                <tr
                  key={m.key}
                  className={`border-b border-zinc-950/5 last:border-b-0 dark:border-white/10 ${m.key === metric.key ? 'bg-accent-50 dark:bg-white/5' : ''}`}
                >
                  <th scope="row" className="py-2.5 pr-3 pl-5 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setSelected(m.key)}
                      aria-pressed={m.key === metric.key}
                      className="text-left text-sm/5 font-medium text-zinc-950 hover:underline dark:text-white"
                    >
                      {m.label}
                    </button>
                    <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">{m.hint}</span>
                  </th>
                  <td className="px-3 py-2.5 text-right text-sm/5 font-medium tabular-nums">{fmt(m, m.current)}</td>
                  <td className="px-3 py-2.5 text-right text-sm/5 text-zinc-600 tabular-nums dark:text-zinc-300">{fmt(m, m.previous)}</td>
                  <td className="px-3 py-2.5 text-right"><ChangeCell change={m.vsPrevious} metric={m} /></td>
                  {showYear ? (
                    <>
                      <td className="px-3 py-2.5 text-right text-sm/5 text-zinc-600 tabular-nums dark:text-zinc-300">{fmt(m, m.lastYear)}</td>
                      <td className="px-3 py-2.5 text-right"><ChangeCell change={m.vsLastYear} metric={m} /></td>
                    </>
                  ) : null}
                  <td className="py-2.5 pr-5 pl-3">
                    <div className="flex justify-end">
                      <Sparkline values={doneValues(m)} label={trendLabel(m)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-zinc-950/5 border-t border-zinc-950/5 md:hidden dark:divide-white/10 dark:border-white/10">
          {data.metrics.map((m) => (
            <li key={m.key} className={`px-4 py-3 ${m.key === metric.key ? 'bg-accent-50 dark:bg-white/5' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelected(m.key)}
                    aria-pressed={m.key === metric.key}
                    className="text-left text-sm/5 font-medium text-zinc-950 dark:text-white"
                  >
                    {m.label}
                  </button>
                  <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{m.hint}</div>
                </div>
                <div className="shrink-0 text-right text-base/6 font-semibold tabular-nums">{fmt(m, m.current)}</div>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs/5">
                  <dt className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">vs prev. {noun}</dt>
                  <dd className="flex items-center gap-2 justify-self-end">
                    <span className="text-zinc-500 tabular-nums dark:text-zinc-400">{fmt(m, m.previous)}</span>
                    <ChangeCell change={m.vsPrevious} metric={m} />
                  </dd>
                  {showYear ? (
                    <>
                      <dt className="whitespace-nowrap text-zinc-500 dark:text-zinc-400">vs last year</dt>
                      <dd className="flex items-center gap-2 justify-self-end">
                        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">{fmt(m, m.lastYear)}</span>
                        <ChangeCell change={m.vsLastYear} metric={m} />
                      </dd>
                    </>
                  ) : null}
                </dl>
                <Sparkline values={doneValues(m)} label={trendLabel(m)} width={72} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Trend" className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <Subheading level={2}>
              {metric.label}, last {trim(metric.series).length} {noun === 'year' ? 'years' : `${noun}s`}
            </Subheading>
            <p className="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">{metric.hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select aria-label="Metric" value={metric.key} onChange={(event) => setSelected(event.target.value as typeof metric.key)} className="min-w-44">
              {data.metrics.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <TrendChart
            points={trim(metric.series)}
            format={(value) => fmt(metric, value)}
            formatAxis={(value) => fmtAxis(metric, value)}
            thisLabel={noun === 'year' ? 'This year' : `Each ${noun}`}
            lastYearLabel={noun === 'year' ? 'Year before' : 'Same period last year'}
            title={trendLabel(metric)}
          />
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAsTable((value) => !value)}
            aria-expanded={asTable}
            className="text-sm/5 font-medium text-accent-700 hover:underline dark:text-accent-300"
          >
            {asTable ? 'Hide table' : 'View as table'}
          </button>
          {asTable ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm/5">
                <caption className="sr-only">{metric.label} by period with the same period a year earlier</caption>
                <thead>
                  <tr className="border-b border-zinc-950/10 text-xs/5 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th scope="col" className="py-2 pr-3 font-medium">Period</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{metric.label}</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Year before</th>
                  </tr>
                </thead>
                <tbody>
                  {trim(metric.series).map((point) => (
                    <tr key={point.start} className="border-b border-zinc-950/5 last:border-b-0 dark:border-white/5">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {point.label}
                        {point.partial ? <span className="text-zinc-500 dark:text-zinc-400"> (so far)</span> : null}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(metric, point.value)}</td>
                      <td className="py-2 pl-3 text-right text-zinc-600 tabular-nums dark:text-zinc-300">{fmt(metric, point.lastYear)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
