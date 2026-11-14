import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { ListSummary } from '@/components/list-summary'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { clearHref } from '@/lib/list-href'
import { sortRows } from '@/lib/table-sort'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deleteItem } from '@/lib/actions/items'
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
import { EmptyState, FormBanner } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { listItems } from '@/lib/queries/items'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import { ItemType } from '@/generated/prisma/enums'
import {
  DIMENSION_UNIT_SHORT,
  ITEM_TYPE_SHORT,
  UNIT_SHORT,
} from '@/lib/labels'

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

  const show =
    params.show === 'all' || params.show === 'inactive' ? params.show : undefined

  // Everything, to offer the materials and to count against; and the search matches.
  const [everyone, matched] = await Promise.all([
    listItems({ includeInactive: true }),
    search ? listItems({ search, includeInactive: true }) : null,
  ])
  const materials = [
    ...new Map(
      everyone.flatMap((item) => (item.material ? [[item.material.id, item.material.name]] : [])),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' }))
  const materialId =
    typeof params.material === 'string' && materials.some(([id]) => id === params.material)
      ? params.material
      : undefined

  const visible = (item: (typeof everyone)[number]) =>
    show === 'all' ? true : show === 'inactive' ? !item.isActive : item.isActive
  const total = everyone.filter(visible).length
  const filtered = Boolean(search || activeTab.type || materialId || show)
  const items = sortRows(
    (matched ?? everyone).filter(
      (item) =>
        visible(item) &&
        (!activeTab.type || item.type === activeTab.type) &&
        (!materialId || item.material?.id === materialId),
    ),
    params,
    {
      code: (item) => item.code,
      name: (item) => item.name,
      type: (item) => ITEM_TYPE_SHORT[item.type],
      material: (item) => item.material?.name,
      rate: (item) => item.rate,
      gst: (item) => item.taxRatePercent,
    },
  )
  const canCreate = can(user.role, 'item:create')
  const canEdit = can(user.role, 'item:update')
  const canDelete = can(user.role, 'item:delete')

  const paged = paginate(items, params)

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
        <div className="flex gap-3">
          {can(user.role, 'item:update') ? (
            <Button outline href="/items/materials">
              Materials
            </Button>
          ) : null}
          {canCreate ? <Button href="/items/new">Add item</Button> : null}
        </div>
      </div>

      {created ? (
        <FormBanner tone="success">Item {created} saved</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name, code, brand, HSN, material…" />
        <StatusFilter
          label="Type"
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/items"
          paramKey="tab"
          defaultValue="all"
        />
        <div className="contents">
          <FilterSelect
            param="material"
            label="Material"
            allLabel="All"
            value={materialId}
            options={materials.map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            param="show"
            label="Status"
            allLabel="Active only"
            value={show}
            options={[
              { value: 'all', label: 'Active and inactive' },
              { value: 'inactive', label: 'Inactive only' },
            ]}
          />
        </div>
      </div>

      {total > 0 ? (
        <ListSummary
          shown={items.length}
          total={total}
          singular="item"
          plural="items"
          filtered={filtered}
          params={params}
          pathname="/items"
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No items yet'}
          description={
            filtered
              ? 'No item matches the current search and filters.'
              : 'Add the materials, hardware and services you quote for.'
          }
          action={
            filtered ? (
              <Button outline href={clearHref('/items', params)}>
                Clear filters
              </Button>
            ) : canCreate ? (
              <Button href="/items/new">Add item</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="code" label="Code" params={params} pathname="/items" />
              <SortHeader column="name" label="Name" params={params} pathname="/items" />
              <SortHeader column="type" label="Type" params={params} pathname="/items" />
              <SortHeader column="material" label="Material" params={params} pathname="/items" />
              <SortHeader column="rate" label="Rate" params={params} pathname="/items" align="right" />
              <SortHeader column="gst" label="GST" params={params} pathname="/items" align="right" />
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((item) => (
              <TableRow key={item.id} href={`/items/${item.id}`}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  {item.brand || item.thickness ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {[
                        item.brand,
                        item.thickness
                          ? `${item.thickness}${DIMENSION_UNIT_SHORT[item.dimensionUnit]}`
                          : null,
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
                  {!item.isActive ? (
                    <Badge color="zinc" className="ml-2">
                      Inactive
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {item.material?.name ?? '—'}
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
              <TableCell>
                  <RowActions
                    name={item.name}
                    
                    editHref={canEdit && (true) ? `/items/${item.id}` : undefined}
                    deleteAction={
                      canDelete && (true)
                        ? deleteItem.bind(null, item.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${item.name}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/items" />
</>
      )}
    </div>
  )
}
