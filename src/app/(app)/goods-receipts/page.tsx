import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { date as dateFormat } from '@/lib/format'
import { paginate } from '@/lib/pagination'
import { can } from '@/lib/permissions'
import { countReceipts, listReceipts } from '@/lib/queries/goods-receipts'
import { requireCapability } from '@/lib/session'
import { RECEIPT_STATUS_COLORS, RECEIPT_STATUS_LABELS } from '@/lib/receipt-labels'
import type { GoodsReceiptStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Goods received',
}

const TABS: { label: string; value: string; status?: GoodsReceiptStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Posted', value: 'posted', status: 'POSTED' },
  { label: 'Cancelled', value: 'cancelled', status: 'CANCELLED' },
]

export default async function GoodsReceiptsPage({
  searchParams,
}: PageProps<'/goods-receipts'>) {
  const user = await requireCapability('purchase:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [receipts, totalCount] = await Promise.all([
    listReceipts({ status: activeTab.status, search }),
    countReceipts(),
  ])
  const paged = paginate(receipts, params)
  const canCreate = can(user.role, 'stock:create')
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Goods received</Heading>
          <Text>What has arrived from vendors, and the stock it added.</Text>
        </div>
        {canCreate ? <Button href="/goods-receipts/new">Receive goods</Button> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search receipt, vendor, bill, order…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/goods-receipts"
        />
      </div>

      {receipts.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/goods-receipts"
          params={params}
          noun="receipt"
          emptyTitle="No goods received yet"
          emptyDescription="Receive goods against a purchase order or a posted bill. Stock-tracked items are added to stock."
          action={canCreate ? <Button href="/goods-receipts/new">Receive goods</Button> : null}
        />
      ) : (
        <>
          <ResultCount shown={receipts.length} total={totalCount} noun="receipt" filtered={isNarrowed} />
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Receipt</TableHeader>
                <TableHeader>Vendor</TableHeader>
                <TableHeader>Received on</TableHeader>
                <TableHeader>Against</TableHeader>
                <TableHeader className="text-right">Lines</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((receipt) => (
                <TableRow key={receipt.id} href={`/goods-receipts/${receipt.id}`}>
                  <TableCell className="font-mono text-xs">{receipt.number}</TableCell>
                  <TableCell className="font-medium">{receipt.vendor.name}</TableCell>
                  <TableCell>{dateFormat.format(receipt.receivedOn)}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {[receipt.po?.number, receipt.bill?.number].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{receipt._count.lines}</TableCell>
                  <TableCell>
                    <Badge color={RECEIPT_STATUS_COLORS[receipt.status]}>
                      {RECEIPT_STATUS_LABELS[receipt.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/goods-receipts" />
        </>
      )}
    </div>
  )
}
