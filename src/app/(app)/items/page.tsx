import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState, FormBanner } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { listItems } from '@/lib/queries/items'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ItemType } from '@/generated/prisma/enums'
import { ITEM_TYPE_SHORT, UNIT_SHORT } from '@/lib/labels'

export const metadata: Metadata = {
  title: 'Items',
}

const TABS: { label: string; value: string; type?: ItemType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Materials', value: 'materials', type: 'MATERIAL' },
  { label: 'Hardware', value: 'hardware', type: 'HARDWARE' },
  { label: 'Services', value: 'services', type: 'SERVICE' },
  { label: 'Finished', value: 'finished', type: 'FINISHED_GOOD' },
]

const TYPE_COLORS: Record<ItemType, 'blue' | 'purple' | 'amber' | 'green'> = {
  MATERIAL: 'blue',
  HARDWARE: 'purple',
  SERVICE: 'amber',
  FINISHED_GOOD: 'green',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

export default async function ItemsPage({ searchParams }: PageProps<'/items'>) {
  const user = await requireCapability('item:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined
  const created = typeof params.created === 'string' ? params.created : undefined

  const items = await listItems({ type: activeTab.type, search })
  const canCreate = can(user.role, 'item:create')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Items</Heading>
          <Text>
            Materials, hardware and services you quote. Rates here seed new
            quotations and orders.
          </Text>
        </div>
        {canCreate ? <Button href="/items/new">Add item</Button> : null}
      </div>

      {created ? (
        <FormBanner tone="success">Item {created} saved</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString() ? `/items?${query.toString()}` : '/items'

            return (
              <Link
                key={tab.value}
                href={href}
                className={
                  isActive
                    ? 'rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search name, brand, HSN…" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No items yet'}
          description={
            search
              ? 'Try a different name, brand or code.'
              : 'Add the materials, hardware and services you quote for.'
          }
          action={
            canCreate && !search ? <Button href="/items/new">Add item</Button> : null
          }
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Code</TableHeader>
              <TableHeader>Name</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">GST</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} href={`/items/${item.id}`}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  {item.brand || item.thicknessMm ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {[
                        item.brand,
                        item.thicknessMm ? `${item.thicknessMm}mm` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge color={TYPE_COLORS[item.type]}>
                    {ITEM_TYPE_SHORT[item.type]}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {item.category?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(item.rate)}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {' '}
                    / {UNIT_SHORT[item.unit]}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {item.taxRatePercent}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
