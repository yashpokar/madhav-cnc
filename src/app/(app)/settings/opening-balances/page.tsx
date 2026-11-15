import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { listOpeningBalances } from '@/lib/queries/cash'
import { requireCapability } from '@/lib/session'
import { OpeningBalancesForm } from './opening-balances-form'

export const metadata: Metadata = {
  title: 'Opening balances',
}

export default async function OpeningBalancesPage() {
  await requireCapability('settings:update')

  const rows = await listOpeningBalances()

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Link
          href="/settings/company"
          className="text-sm/5 text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Company details
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
    </div>
  )
}
