'use client'

import { useLayoutEffect, useRef, useState } from 'react'

export type TrendPoint = {
  label: string
  value: number
  lastYear: number
  partial: boolean
}

const HEIGHT = 248
const PAD = { top: 12, right: 12, bottom: 28, left: 52 }

/** A round step (1, 2, 2.5, 5 times a power of ten) giving about four gridlines. */
function niceStep(span: number) {
  const raw = span / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power

  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

/**
 * Bars for this period's trend with a dashed line for the same periods a year
 * earlier. Hover or focus a column for the exact figures. The drawing is hidden
 * from screen readers; the table under it (see CompareExplorer) is the accessible
 * version of the same data.
 */
export function TrendChart({
  points,
  format,
  formatAxis,
  thisLabel,
  lastYearLabel,
  title,
}: {
  points: TrendPoint[]
  format: (value: number) => string
  formatAxis: (value: number) => string
  thisLabel: string
  lastYearLabel: string
  title: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const node = box.current

    if (!node) return

    const measure = () => setWidth(Math.max(Math.round(node.clientWidth), 260))

    measure()

    const observer = new ResizeObserver(measure)

    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  const all = points.flatMap((p) => [p.value, p.lastYear])
  const step = niceStep((Math.max(...all, 0) - Math.min(...all, 0)) || 1)
  const top = Math.ceil(Math.max(...all, 0) / step) * step
  const bottom = Math.floor(Math.min(...all, 0) / step) * step
  const ticks: number[] = []

  for (let tick = bottom; tick <= top + step / 2; tick += step) ticks.push(Math.round(tick * 100) / 100)

  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const band = innerW / points.length
  const barW = Math.min(Math.max(band * 0.5, 6), 36)
  const y = (value: number) => PAD.top + (1 - (value - bottom) / (top - bottom || 1)) * innerH
  const cx = (index: number) => PAD.left + band * index + band / 2
  const every = Math.max(1, Math.ceil(46 / band))
  const line = points.map((p, index) => `${cx(index).toFixed(1)},${y(p.lastYear).toFixed(1)}`).join(' ')
  const hit = active === null ? null : points[active]

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs/5 text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-xs bg-accent-600 dark:bg-accent-400" />
          {thisLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden="true" width="18" height="8" className="block">
            <line x1="0" x2="18" y1="4" y2="4" strokeWidth="2" strokeDasharray="4 3" className="stroke-zinc-500 dark:stroke-zinc-400" />
          </svg>
          {lastYearLabel}
        </span>
        <span className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-xs bg-accent-600/50 dark:bg-accent-400/50" />
          Period in progress
        </span>
      </div>

      <div ref={box} className="relative" onMouseLeave={() => setActive(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={title} className="block select-none">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                strokeWidth={1}
                className={tick === 0 ? 'stroke-zinc-400 dark:stroke-zinc-500' : 'stroke-zinc-950/10 dark:stroke-white/10'}
              />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums dark:fill-zinc-400">
                {formatAxis(tick)}
              </text>
            </g>
          ))}

          {points.map((p, index) => {
            const barTop = Math.min(y(p.value), y(0))
            const barH = Math.max(Math.abs(y(p.value) - y(0)), p.value === 0 ? 0 : 2)

            return (
              <rect
                key={`bar-${p.label}-${index}`}
                x={cx(index) - barW / 2}
                y={barTop}
                width={barW}
                height={barH}
                rx={4}
                className={`fill-accent-600 dark:fill-accent-400 ${p.partial ? 'opacity-50' : ''} ${active === index ? 'brightness-110' : ''}`}
              />
            )
          })}

          <polyline points={line} fill="none" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" className="stroke-zinc-500 dark:stroke-zinc-400" />
          {points.map((p, index) => (
            <circle key={`dot-${p.label}-${index}`} cx={cx(index)} cy={y(p.lastYear)} r={3.5} strokeWidth={2} className="fill-zinc-500 stroke-white dark:fill-zinc-400 dark:stroke-zinc-900" />
          ))}

          {points.map((p, index) =>
            (points.length - 1 - index) % every === 0 ? (
              <text key={`x-${p.label}-${index}`} x={cx(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-zinc-500 text-[11px] dark:fill-zinc-400">
                {p.label}
              </text>
            ) : null,
          )}

          {active !== null ? (
            <line x1={cx(active)} x2={cx(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} strokeWidth={1} className="stroke-zinc-950/20 dark:stroke-white/25" />
          ) : null}

          {points.map((p, index) => (
            <rect
              key={`hit-${p.label}-${index}`}
              x={PAD.left + band * index}
              y={PAD.top}
              width={band}
              height={innerH}
              fill="transparent"
              aria-hidden="true"
              onMouseEnter={() => setActive(index)}
              onTouchStart={() => setActive(index)}
            />
          ))}
        </svg>

        {hit && active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-44 rounded-lg bg-zinc-950 px-3 py-2 text-xs/5 text-white shadow-lg ring-1 ring-white/10 dark:bg-zinc-800"
            style={{
              top: 4,
              left: Math.min(Math.max(cx(active) - 88, 0), Math.max(width - 176, 0)),
            }}
          >
            <div className="font-medium">
              {hit.label}
              {hit.partial ? <span className="font-normal text-zinc-300"> so far</span> : null}
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-zinc-300">{thisLabel}</span>
              <span className="tabular-nums">{format(hit.value)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-300">{lastYearLabel}</span>
              <span className="tabular-nums">{format(hit.lastYear)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
