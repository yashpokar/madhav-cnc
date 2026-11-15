import { detailRows, type Direction } from '@/lib/payment-methods'

/** The structured fields recorded with a payment, as a tidy definition list. Nothing when there are none. */
export function PaymentDetailsList({
  mode,
  details,
  direction = 'in',
}: {
  mode: string
  details: unknown
  direction?: Direction
}) {
  const rows = detailRows(mode, details, direction)

  if (rows.length === 0) return null

  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 surface-card p-4 text-sm/6 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key}>
          <dt className="text-zinc-500 dark:text-zinc-400">{row.label}</dt>
          <dd className="break-words font-medium text-zinc-950 dark:text-white">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
