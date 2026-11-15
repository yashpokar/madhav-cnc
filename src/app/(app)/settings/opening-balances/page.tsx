import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { AdjustBalanceButton } from '@/components/adjust-balance-dialog'
import { Subheading } from '@/components/catalyst/heading'
import { getChannelBalances, listOpeningBalances } from '@/lib/queries/cash'
import { requireCapability } from '@/lib/session'
import { OpeningBalancesForm } from './opening-balances-form'

export const metadata: Metadata = {
  title: 'Opening balances',
}

export default async function OpeningBalancesPage() {
  await requireCapability('settings:update')

  const [rows, balances] = await Promise.all([listOpeningBalances(), getChannelBalances()])

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Link
          href="/settings/company"
          className="text-sm/5 text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Business profile
        </Link>
        <Heading>Opening balances</Heading>
        <Text className="max-w-2xl">
          What each payment mode held on the day you started using the system:
          cash in hand, or the balance in a bank account. Receipts and expenses
          dated on or after that day are added on top; earlier history is not
          counted again. A balance can be negative (an overdraft). Customer and
          vendor opening balances are set on their own pages.
        </Text>
      </div>

      <OpeningBalancesForm
        rows={rows.map((row) => ({
          channelId: row.id,
          name: row.name,
          isActive: row.isActive,
          amount: row.amount === null ? '' : String(row.amount),
          asOf: row.asOf ? row.asOf.toISOString().slice(0, 10) : '',
        }))}
      />

      {balances.length > 0 ? (
        <section className="grid grid-cols-1 gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Subheading level={2}>Adjust a balance</Subheading>
            <Link href="/adjustments" className="text-sm/6 text-zinc-500 underline dark:text-zinc-400">
              All adjustments
            </Link>
          </div>
          <Text>
            Forgot to enter something? Record a dated adjustment instead of editing the opening
            balance. Each one is listed with its reason and can be undone.
          </Text>
          <ul className="grid grid-cols-1 gap-2">
            {balances.map((b) => (
              <li
                key={b.channelId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 dark:ring-white/10"
              >
                <span className="font-medium">{b.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
                    {b.closing === null
                      ? 'No opening balance yet'
                      : `Balance ${b.closing < 0 ? '−' : ''}₹${Math.abs(b.closing).toLocaleString('en-IN')}`}
                  </span>
                  <AdjustBalanceButton
                    plain={false}
                    target={{
                      kind: 'CHANNEL',
                      id: b.channelId,
                      name: b.name,
                      current: b.closing ?? undefined,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
