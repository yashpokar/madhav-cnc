import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
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

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const date = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export default async function VendorsPage({ searchParams }: PageProps<'/vendors'>) {
  const user = await requireCapability('expense:read')
  const params = await searchParams
  const search = typeof params.q === 'string' ? params.q : undefined
  const includeInactive = params.inactive === '1'

  const vendors = await listVendors({ search, includeInactive })
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
          <SearchField placeholder="Search name, phone, GSTIN…" />
          <Button outline href={includeInactive ? '/vendors' : '/vendors?inactive=1'}>
            {includeInactive ? 'Hide inactive' : 'Show inactive'}
          </Button>
          {can(user.role, 'expense:create') ? <Button href="/vendors/new">Add vendor</Button> : null}
        </div>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          title={search ? 'No vendors match' : 'No vendors yet'}
          description={
            search
              ? 'Try a different name, phone or GSTIN.'
              : 'Vendors appear here as you add expenses, or add one yourself.'
          }
        />
      ) : (
        <>
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Vendor</TableHeader>
                <TableHeader>Contact</TableHeader>
                <TableHeader>GSTIN</TableHeader>
                <TableHeader className="text-right">Paid</TableHeader>
                <TableHeader>Last paid</TableHeader>
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
