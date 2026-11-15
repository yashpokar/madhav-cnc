import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
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
import { ExportButton } from '@/components/export-button'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { money, moneyWhole } from '@/lib/format'
import { UNIT_SHORT } from '@/lib/labels'
import { paginate } from '@/lib/pagination'
import { listStock } from '@/lib/queries/stock'
import { requireCapability } from '@/lib/session'
import { STOCK_STATE_COLORS, STOCK_STATE_LABELS } from '@/lib/receipt-labels'
import type { StockFilter } from '@/lib/stock-rules'
import type { UnitOfMeasure } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Stock',
}

const TABS: { label: string; value: StockFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Low or out', value: 'low' },
  { label: 'Out of stock', value: 'out' },
  { label: 'Negative', value: 'negative' },
]

export default async function StockPage({ searchParams }: PageProps<'/stock'>) {
  await requireCapability('stock:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [rows, everything] = await Promise.all([
    listStock({ search, filter: activeTab.value }),
    listStock(),
  ])
  const paged = paginate(rows, params)
  const isNarrowed = isFiltered(params, activeTab.value)
  const totalValue = everything.reduce((sum, row) => sum + row.value, 0)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Stock</Heading>
          <Text>
            {everything.length === 0
              ? 'Nothing is tracked yet.'
              : `${everything.length} tracked · ${moneyWhole.format(totalValue)} at average cost`}
          </Text>
        </div>
        <ExportButton kind="stock" search={search} status={activeTab.value === 'all' ? undefined : activeTab.value} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search item or material…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/stock"
        />
      </div>

      {rows.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/stock"
          params={params}
          noun="stocked item"
          emptyTitle="No stock tracked yet"
          emptyDescription="Turn on Track stock on an item or a material (Items), then set opening stock here or receive goods against a purchase."
        />
      ) : (
        <>
          <ResultCount shown={rows.length} total={everything.length} noun="stocked item" filtered={isNarrowed} />
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Item</TableHeader>
                <TableHeader>Unit</TableHeader>
                <TableHeader className="text-right">On hand</TableHeader>
                <TableHeader className="text-right">Average cost</TableHeader>
                <TableHeader className="text-right">Value</TableHeader>
                <TableHeader className="text-right">Reorder level</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((row) => (
                <TableRow key={`${row.kind}:${row.id}`} href={`/stock/${row.kind}/${row.id}`}>
                  <TableCell className="font-medium">
                    {row.name}
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      {row.code ?? 'Material'}
                    </div>
                  </TableCell>
                  <TableCell>{row.unit ? UNIT_SHORT[row.unit as UnitOfMeasure] : '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.onHand}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.averageCost > 0 ? money.format(row.averageCost) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.value > 0 ? money.format(row.value) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.reorderLevel ?? '—'}</TableCell>
                  <TableCell>
                    {row.state === 'ok' ? null : (
                      <Badge color={STOCK_STATE_COLORS[row.state]}>{STOCK_STATE_LABELS[row.state]}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/stock" />
        </>
      )}
    </div>
  )
}
