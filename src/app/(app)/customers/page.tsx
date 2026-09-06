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
import { EmptyState, FormBanner } from '@/components/form-banner'
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

  const customers = await listCustomers({ search })
  const canCreate = can(user.role, 'customer:create')

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Customers</Heading>
          <Text>{customers.length} record{customers.length === 1 ? '' : 's'}</Text>
        </div>
        {canCreate ? <Button href="/customers/new">Add customer</Button> : null}
      </div>

      {created ? (
        <FormBanner tone="success">Customer {created} saved</FormBanner>
      ) : null}

      <div className="flex justify-end">
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
            </TableRow>
          </TableHead>
          <TableBody>
            {customers.map((customer) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
