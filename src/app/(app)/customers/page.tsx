import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { RowActions } from '@/components/row-actions'
import { deleteCustomer } from '@/lib/actions/customers'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { ExportButton } from '@/components/export-button'
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
import { Link } from '@/components/catalyst/link'
import { SearchField } from '@/components/search-field'
import { listCustomers } from '@/lib/queries/customers'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import type { CustomerStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Customers',
}

const STATUS_COLORS: Record<CustomerStatus, 'lime' | 'zinc' | 'amber'> = {
  ACTIVE: 'lime',
  INACTIVE: 'zinc',
  ON_HOLD: 'amber',
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ON_HOLD: 'On hold',
}

export default async function CustomersPage({
  searchParams,
}: PageProps<'/customers'>) {
  const user = await requireCapability('customer:read')
  const params = await searchParams
  const search = typeof params.q === 'string' ? params.q : undefined
  const created = typeof params.created === 'string' ? params.created : undefined

  const status =
    typeof params.status === 'string' &&
    ['ACTIVE', 'INACTIVE', 'ON_HOLD'].includes(params.status)
      ? (params.status as CustomerStatus)
      : undefined
  const everyone = await listCustomers({ search })
  const customers = status
    ? everyone.filter((customer) => customer.status === status)
    : everyone
  const canCreate = can(user.role, 'customer:create')
  const canEdit = can(user.role, 'customer:update')
  const canDelete = can(user.role, 'customer:delete')

  const paged = paginate(customers, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Customers</Heading>
          <Text>{customers.length} record{customers.length === 1 ? '' : 's'}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="customers" search={search} />
          {canCreate ? <Button href="/customers/new">Add customer</Button> : null}
        </div>
      </div>

      {created ? (
        <FormBanner tone="success">Customer {created} saved</FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {[
            { value: undefined, label: 'All' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ON_HOLD', label: 'On hold' },
            { value: 'INACTIVE', label: 'Inactive' },
          ].map((tab) => {
            const query = new URLSearchParams()
            if (tab.value) query.set('status', tab.value)
            if (search) query.set('q', search)
            const href = query.toString() ? `/customers?${query}` : '/customers'

            return (
              <Link
                key={tab.label}
                href={href}
                className={
                  tab.value === status
                    ? 'shrink-0 rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'shrink-0 rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search name, phone, city…" />
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No customers yet'}
          description={
            search
              ? 'Try a different name, phone number or city.'
              : 'Add your first customer to start raising quotations and orders.'
          }
          action={
            canCreate && !search ? (
              <Button href="/customers/new">Add customer</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Code</TableHeader>
              <TableHeader>Name</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>City</TableHeader>
              <TableHeader>Architect</TableHeader>
              <TableHeader>Carpenter</TableHeader>
              <TableHeader>Status</TableHeader>
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((customer) => (
              <TableRow key={customer.id} href={`/customers/${customer.id}`}>
                <TableCell className="font-mono text-xs">
                  {customer.code}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{customer.name}</div>
                  {customer.email ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {customer.email}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {customer.city ?? '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {customer.preferredArchitect?.name ?? '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {customer.preferredCarpenter?.name ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge color={STATUS_COLORS[customer.status]}>
                    {STATUS_LABELS[customer.status]}
                  </Badge>
                </TableCell>
              <TableCell>
                  <RowActions
                    name={customer.name}
                    
                    editHref={canEdit && (true) ? `/customers/${customer.id}` : undefined}
                    deleteAction={
                      canDelete && (true)
                        ? deleteCustomer.bind(null, customer.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${customer.name}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/customers" />
</>
      )}
    </div>
  )
}
