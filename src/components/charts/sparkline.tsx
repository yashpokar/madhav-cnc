/**
 * A tiny trend line with no axes: just the shape, and a dot on the latest value.
 * Pure SVG, no hooks, so it renders on the server. The latest period may still
 * be in progress, so the last segment is drawn dashed when `partial` is set.
 */
export function Sparkline({
  values,
  label,
  partial = false,
  width = 96,
  height = 28,
}: {
  values: number[]
  /** Read by screen readers instead of the drawing. */
  label: string
  partial?: boolean
  width?: number
  height?: number
}) {
  const pad = 3
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const x = (index: number) => pad + (index * (width - 2 * pad)) / Math.max(values.length - 1, 1)
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - 2 * pad)
  const point = (index: number) => `${x(index).toFixed(1)},${y(values[index]).toFixed(1)}`
  const last = values.length - 1
  const solid = values.slice(0, partial ? last : values.length).map((_, index) => point(index))

  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="stroke-zinc-950/10 dark:stroke-white/10" strokeWidth={1} />
      {solid.length > 1 ? (
        <polyline points={solid.join(' ')} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-accent-600 dark:stroke-accent-400" />
      ) : null}
      {partial && last > 0 ? (
        <polyline points={`${point(last - 1)} ${point(last)}`} fill="none" strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" className="stroke-accent-600 dark:stroke-accent-400" />
      ) : null}
      <circle cx={x(last)} cy={y(values[last])} r={3} strokeWidth={2} className="fill-accent-600 stroke-white dark:fill-accent-400 dark:stroke-zinc-900" />
    </svg>
  )
}
