import { date as dateLong, dateShort, moneyWhole as inr } from '@/lib/format'
import type { Metadata } from 'next'
import { DateRangeFilter } from '@/components/date-range-filter'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { readDateRange } from '@/lib/list-controls'
import { paymentsByMethod } from '@/lib/queries/payment-methods'
import { getChannelBalances } from '@/lib/queries/cash'
import { AdjustBalanceButton } from '@/components/adjust-balance-dialog'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = { title: 'Payment methods' }

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Negative amounts keep an explicit minus sign. */
const signed = (value: number) =>
  value < 0 ? `−${inr.format(Math.abs(value))}` : inr.format(value)

const netTone = (value: number) =>
  value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-950 dark:text-white'

export default async function PaymentMethodsPage({
  searchParams,
}: PageProps<'/reports/payment-methods'>) {
  const user = await requireCapability('payment:read')
  const canExpenses = can(user.role, 'expense:read')
  const params = await searchParams

  const now = new Date()
  const range = readDateRange(params)
  const from = range.from ?? iso(new Date(now.getFullYear(), now.getMonth(), 1))
  const to = range.to ?? iso(now)

  const [{ groups, totals }, balances] = await Promise.all([
    paymentsByMethod({ from, to }, canExpenses),
    canExpenses ? getChannelBalances() : Promise.resolve([]),
  ])
  const withOpening = balances.filter((b) => b.closing !== null)
  const canSetOpening = can(user.role, 'settings:update')
  const canAdjust = canSetOpening

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Link href="/reports" className="text-sm/5 text-zinc-500 hover:underline dark:text-zinc-400">
          ← Reports
        </Link>
        <Heading>Payment methods</Heading>
        <Text>
          Money {canExpenses ? 'received and spent' : 'received'}, grouped by how it was paid.
        </Text>
      </div>

      {canExpenses && balances.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Subheading level={2}>Balance by payment mode</Subheading>
            {canSetOpening ? (
              <Link
                href="/adjustments"
                className="text-sm/6 text-zinc-500 underline dark:text-zinc-400"
              >
                Adjustments
              </Link>
            ) : null}
            {canSetOpening ? (
              <Link
                href="/settings/opening-balances"
                className="text-sm/6 text-zinc-500 underline dark:text-zinc-400"
              >
                {withOpening.length === 0 ? 'Set opening balances' : 'Edit opening balances'}
              </Link>
            ) : null}
          </div>
          {withOpening.length === 0 ? (
            <Text>
              Enter what each payment mode held when you started using the system to
              see its running balance here.
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm/6">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Payment mode</th>
                    <th className="pb-2 pr-3 text-right font-medium">Opening</th>
                    <th className="pb-2 pr-3 text-right font-medium">In</th>
                    <th className="pb-2 pr-3 text-right font-medium">Out</th>
                    <th className="pb-2 pr-3 text-right font-medium">Adjustments</th>
                    <th className="pb-2 text-right font-medium">Closing</th>
                    {canAdjust ? <th className="pb-2 pl-3 font-medium"><span className="sr-only">Adjust</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {withOpening.map((b) => (
                    <tr key={b.channelId} className="border-t border-zinc-950/5 dark:border-white/10">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{b.name}</div>
                        {b.asOf ? (
                          <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                            from {dateLong.format(b.asOf)}
                          </div>
                        ) : null}
                      </td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${netTone(b.opening ?? 0)}`}>
                        {signed(b.opening ?? 0)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-lime-700 dark:text-lime-400">
                        {inr.format(b.inflow)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {inr.format(b.outflow)}
                      </td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${b.adjustments === 0 ? 'text-zinc-400' : netTone(b.adjustments)}`}>
                        {b.adjustments === 0 ? '—' : signed(b.adjustments)}
                      </td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${netTone(b.closing ?? 0)}`}>
                        {signed(b.closing ?? 0)}
                      </td>
                      {canAdjust ? (
                        <td className="py-2 pl-3 text-right">
                          <AdjustBalanceButton
                            target={{
                              kind: 'CHANNEL',
                              id: b.channelId,
                              name: b.name,
                              current: b.closing ?? 0,
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <DateRangeFilter defaultFrom={from} defaultTo={to} label="Date" autoSubmit />
        <Button type="submit" outline>
          Apply
        </Button>
      </form>

      {groups.length === 0 ? (
        <EmptyState
          title="No entries in this period"
          description="Receipts and expenses in the chosen dates appear here, grouped by payment method."
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li
                key={g.name}
                className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
              >
                <div className="truncate font-medium" title={g.name}>
                  {g.name}
                </div>
                <div className={`mt-1 text-2xl/8 font-semibold tabular-nums ${netTone(g.net)}`}>
                  {inr.format(g.net)}
                  <span className="ml-1 text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">net</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm/5">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Received ({g.receivedCount})</dt>
                    <dd className="tabular-nums text-lime-700 dark:text-lime-400">{inr.format(g.received)}</dd>
                  </div>
                  {canExpenses ? (
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">Spent ({g.spentCount})</dt>
                      <dd className="tabular-nums text-rose-600 dark:text-rose-400">{inr.format(g.spent)}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg p-4 ring-1 ring-zinc-950/10 dark:ring-white/10">
            <span className="font-medium">Grand total</span>
            <span className="flex flex-wrap gap-x-6 gap-y-1 text-sm/6 tabular-nums">
              <span>
                Received {inr.format(totals.received)} ({totals.receivedCount})
              </span>
              {canExpenses ? (
                <span>
                  Spent {inr.format(totals.spent)} ({totals.spentCount})
                </span>
              ) : null}
              {canExpenses ? (
                <span className={`font-semibold ${netTone(totals.net)}`}>Net {inr.format(totals.net)}</span>
              ) : null}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {groups.map((g, index) => (
              <details
                key={g.name}
                open={index === 0}
                className="group rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
              >
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 p-4">
                  <Subheading level={2}>{g.name}</Subheading>
                  <span className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {g.entries.length} entr{g.entries.length === 1 ? 'y' : 'ies'}
                  </span>
                </summary>
                <ul className="divide-y divide-zinc-950/5 border-t border-zinc-950/5 dark:divide-white/10 dark:border-white/10">
                  {g.entries.map((e) => (
                    <li key={`${e.kind}-${e.id}`}>
                      <Link
                        href={
                          e.source === 'adjustment'
                            ? `/adjustments?q=${e.number}`
                            : e.kind === 'in'
                              ? `/payments/${e.id}`
                              : `/expenses/${e.id}`
                        }
                        className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2.5 text-sm/6 hover:bg-zinc-950/2.5 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{e.party}</span>
                          <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
                            {dateShort.format(e.date)} · {e.number}
                          </span>
                        </span>
                        <span
                          className={`text-right tabular-nums ${e.kind === 'in' ? 'text-lime-700 dark:text-lime-400' : 'text-rose-600 dark:text-rose-400'}`}
                        >
                          {e.kind === 'in' ? '+' : '−'}
                          {inr.format(e.amount)}
                          <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">
                            {e.source === 'adjustment' ? 'Adjustment · ' : ''}
                            {e.kind === 'in' ? 'In' : 'Out'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
