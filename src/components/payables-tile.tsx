import { moneyWhole as inr } from '@/lib/format'
import { Link } from '@/components/catalyst/link'
import { getPayables } from '@/lib/queries/payables'

/** What the business owes its vendors, with the overdue part, linking to /payables. */
export async function PayablesTile() {
  const data = await getPayables(new Date())

  return (
    <Link
      href="/payables"
      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 surface-card surface-card-interactive p-4 print:hidden"
    >
      <span className="text-sm/6 text-zinc-500 dark:text-zinc-400">Payable to vendors</span>
      <span className="text-xl/7 font-semibold tabular-nums">{inr.format(data.totalPayable)}</span>
      <span
        className={
          data.overdue > 0
            ? 'text-sm/6 text-rose-600 dark:text-rose-400'
            : 'text-sm/6 text-zinc-500 dark:text-zinc-400'
        }
      >
        {data.overdue > 0 ? `${inr.format(data.overdue)} overdue` : 'Nothing overdue'}
      </span>
    </Link>
  )
}
