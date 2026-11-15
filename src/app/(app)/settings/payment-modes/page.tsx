import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listPaymentModesWithUse, parseDetails } from '@/lib/queries/payment-modes'
import { readReceivingValues } from '@/lib/payment-methods'
import { requireCapability } from '@/lib/session'
import { ModesManager } from './modes-manager'

export const metadata: Metadata = {
  title: 'Payment modes',
}

export default async function PaymentModesPage() {
  await requireCapability('settings:update')

  const rows = await listPaymentModesWithUse()

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-2">
        <Heading>Payment modes</Heading>
        <Text className="max-w-2xl">
          The ways money comes in and goes out: cash, a bank account, a UPI handle, a cheque book,
          anything else. Fill in how you receive money (UPI ID, account number, IFSC, payable-to)
          and tick a mode to print it on invoices and quotations so customers know how to pay.
        </Text>
      </div>

      <ModesManager
        modes={rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.mode,
          isActive: row.isActive,
          used: row._count.payments + row._count.expenses,
          details: parseDetails(row.details),
          accountDetails: readReceivingValues(row.mode, row.accountDetails),
          showOnDocuments: row.showOnDocuments,
          hasQr: Boolean(row.qrStoredName),
        }))}
      />
    </div>
  )
}
