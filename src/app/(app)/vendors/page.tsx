import { date, moneyWhole as money } from '@/lib/format'
import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { ListControls } from '@/components/list-controls'
import { ListSummary } from '@/components/list-summary'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { clearHref } from '@/lib/list-href'
import {
  amountCeiling,
  applyListControls,
  readDateRange,
  readListControls,
} from '@/lib/list-controls'
import { sortRows } from '@/lib/table-sort'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deleteVendor } from '@/lib/actions/vendors'
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
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { listVendors } from '@/lib/queries/vendors'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Vendors',
}

export default async function VendorsPage({ searchParams }: PageProps<'/vendors'>) {
  const user = await requireCapability('expense:read')
  const params = await searchParams
  const search = typeof params.q === 'string' ? params.q : undefined
  // Active vendors by default; `inactive=1` is the older spelling of show=all.
  const show =
    params.show === 'all' || params.show === 'inactive'
      ? params.show
      : params.inactive === '1'
        ? 'all'
        : undefined

  const [everyone, matched] = await Promise.all([
    listVendors({ includeInactive: true }),
    search ? listVendors({ search, includeInactive: true }) : null,
  ])
  const visible = (vendor: (typeof everyone)[number]) =>
    show === 'all' ? true : show === 'inactive' ? !vendor.isActive : vendor.isActive
  const scope = (matched ?? everyone).filter(visible)
  const total = everyone.filter(visible).length

  // Last-paid dates and paid totals narrow the list; vendors never paid have
  // no date, so a date range leaves them out.
  const { from, to } = readDateRange(params)
  const { min, max } = readListControls(params)
  const ranged = applyListControls(
    from || to ? scope.filter((vendor) => vendor.lastPaid) : scope,
    params,
    {
      date: (vendor) => vendor.lastPaid ?? new Date(0),
      amount: (vendor) => vendor.spent,
    },
  )
  const filtered = Boolean(search || show || from || to || min !== undefined || max !== undefined)
  const vendors = sortRows(ranged, params, {
    name: (vendor) => vendor.name,
    contact: (vendor) => vendor.contactName ?? vendor.phone,
    gstin: (vendor) => vendor.gstin,
    paid: (vendor) => (vendor.bills > 0 ? vendor.spent : null),
    lastPaid: (vendor) => vendor.lastPaid,
  })
  const paged = paginate(vendors, params)
  const canEdit = can(user.role, 'expense:update')
  const canDelete = can(user.role, 'expense:delete')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Vendors</Heading>
          <Text>Everyone you pay: suppliers, contractors and utilities.</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(user.role, 'expense:create') ? <Button href="/vendors/new">Add vendor</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name, phone, GSTIN, city…" />
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
        {total > 0 ? (
<ListControls
            params={params}
            pathname="/vendors"
            amountLabel="Paid"
            ceiling={amountCeiling(scope, (vendor) => vendor.spent)}
          />
        ) : null}
      </div>

      {total > 0 ? (
        <>
          <ListSummary
            shown={vendors.length}
            total={total}
            singular="vendor"
            plural="vendors"
            filtered={filtered}
            params={params}
            pathname="/vendors"
          />
        </>
      ) : null}

      {vendors.length === 0 ? (
        <EmptyState
          title={filtered ? 'No vendors match' : 'No vendors yet'}
          description={
            filtered
              ? 'No vendor matches the current search and filters.'
              : 'Vendors appear here as you add expenses, or add one yourself.'
          }
          action={
            filtered ? (
              <Button outline href={clearHref('/vendors', params)}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <SortHeader column="name" label="Vendor" params={params} pathname="/vendors" />
                <SortHeader column="contact" label="Contact" params={params} pathname="/vendors" />
                <SortHeader column="gstin" label="GSTIN" params={params} pathname="/vendors" />
                <SortHeader column="paid" label="Paid" params={params} pathname="/vendors" align="right" />
                <SortHeader column="lastPaid" label="Last paid" params={params} pathname="/vendors" />
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((vendor) => (
                <TableRow key={vendor.id} href={`/vendors/${vendor.id}`}>
                  <TableCell>
                    <span className="font-medium">{vendor.name}</span>
                    {vendor.isActive ? null : (
                      <Badge color="zinc" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                    {vendor.description ? (
                      <span className="block max-w-xs truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
                        {vendor.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {vendor.contactName ?? vendor.phone ? (
                      <>
                        {vendor.contactName}
                        {vendor.phone ? (
                          <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">
                            {vendor.phone}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{vendor.gstin ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vendor.bills > 0 ? money.format(vendor.spent) : '—'}
                    {vendor.bills > 0 ? (
                      <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">
                        {vendor.bills} payment{vendor.bills === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {vendor.lastPaid ? date.format(vendor.lastPaid) : '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      name={vendor.name}
                      editHref={canEdit ? `/vendors/${vendor.id}` : undefined}
                      deleteAction={
                        canDelete && vendor.bills === 0 ? deleteVendor.bind(null, vendor.id) : undefined
                      }
                      deleteTitle={`Delete ${vendor.name}?`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/vendors" />
        </>
      )}
    </div>
  )
}
