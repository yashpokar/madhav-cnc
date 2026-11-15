import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Heading } from '@/components/catalyst/heading'
import { Text, TextLink } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { createReceipt } from '@/lib/actions/goods-receipts'
import { date as dateFormat } from '@/lib/format'
import { listBills, listPurchaseOrders } from '@/lib/queries/purchases'
import { requireCapability } from '@/lib/session'
import { todayIso } from '@/lib/purchase-rules'
import { getReceivable, type ReceiveSource } from '@/lib/services/goods-receipts'
import { PO_STATUS_COLORS, PO_STATUS_LABELS } from '@/lib/labels'
import { ReceiptForm } from '../receipt-form'

export const metadata: Metadata = {
  title: 'Receive goods',
}

export default async function NewReceiptPage({
  searchParams,
}: PageProps<'/goods-receipts/new'>) {
  await requireCapability('stock:create')
  const params = await searchParams
  const billId = typeof params.bill === 'string' ? params.bill : null
  const poId = typeof params.po === 'string' ? params.po : null
  const source: ReceiveSource | null = billId
    ? { kind: 'bill', billId }
    : poId
      ? { kind: 'order', poId }
      : null

  if (!source) {
    const [bills, orders] = await Promise.all([
      listBills({ status: 'POSTED' }),
      listPurchaseOrders(),
    ])
    const open = orders.filter((order) => order.status === 'SENT' || order.status === 'PARTIAL')

    return (
      <div className="grid grid-cols-1 gap-8">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Receive goods</Heading>
          <Text>Choose what the goods arrived against.</Text>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="grid content-start gap-2">
            <h2 className="text-sm/6 font-semibold">Purchase orders awaiting goods</h2>
            {open.length === 0 ? (
              <Text>No sent purchase orders are waiting for goods.</Text>
            ) : (
              <ul className="grid gap-1 text-sm/6">
                {open.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center gap-3">
                    <TextLink href={`/goods-receipts/new?po=${order.id}`}>{order.number}</TextLink>
                    <span>{order.vendor.name}</span>
                    <Badge color={PO_STATUS_COLORS[order.status]}>
                      {PO_STATUS_LABELS[order.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid content-start gap-2">
            <h2 className="text-sm/6 font-semibold">Posted bills</h2>
            {bills.length === 0 ? (
              <Text>No bills are posted yet.</Text>
            ) : (
              <ul className="grid gap-1 text-sm/6">
                {bills.slice(0, 30).map((bill) => (
                  <li key={bill.id} className="flex flex-wrap items-center gap-3">
                    <TextLink href={`/goods-receipts/new?bill=${bill.id}`}>{bill.number}</TextLink>
                    <span>{bill.vendor.name}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(bill.billDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    )
  }

  const receivable = await getReceivable(source)

  if ('error' in receivable) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <Heading>Receive goods</Heading>
        <FormBanner tone="error">{receivable.error}</FormBanner>
        <TextLink href="/goods-receipts/new">Choose something else</TextLink>
      </div>
    )
  }

  const open = receivable.lines.filter((line) => line.remaining > 0)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Receive goods</Heading>
        <Text>
          {receivable.vendorName} · against{' '}
          <TextLink
            href={
              source.kind === 'bill' ? `/purchase-bills/${source.billId}` : `/purchase-orders/${source.poId}`
            }
          >
            {receivable.number}
          </TextLink>
          . Enter what arrived now; the rest stays open for a later receipt.
        </Text>
      </div>

      {receivable.lines.length === 0 ? (
        <FormBanner tone="error">This document has no goods lines to receive.</FormBanner>
      ) : open.length === 0 ? (
        <FormBanner tone="success">Everything on {receivable.number} has been received.</FormBanner>
      ) : (
        <ReceiptForm
          action={createReceipt}
          source={{
            kind: source.kind,
            id: source.kind === 'bill' ? source.billId : source.poId,
          }}
          lines={receivable.lines}
          today={todayIso()}
        />
      )}
    </div>
  )
}
