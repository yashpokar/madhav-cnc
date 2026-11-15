import type { Metadata } from 'next'
import { FilterSelect } from '@/components/filter-select'
import { ListSummary } from '@/components/list-summary'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { clearHref } from '@/lib/list-href'
import { sortRows } from '@/lib/table-sort'
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
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { listCustomers } from '@/lib/queries/customers'
import { can } from '@/lib/permissions'
import { getActiveIndustry } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import type { CustomerStatus, CustomerType } from '@/generated/prisma/enums'

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

const TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: 'Individual',
  COMPANY: 'Company',
}

export default async function CustomersPage({
  searchParams,
}: PageProps<'/customers'>) {
  const user = await requireCapability('customer:read')
  const params = await searchParams
  const search = typeof params.q === 'string' ? params.q : undefined
  const created = typeof params.created === 'string' ? params.created : undefined
  const createdId = typeof params.customer === 'string' ? params.customer : undefined
  const industry = await getActiveIndustry()

  const status =
    typeof params.status === 'string' &&
    ['ACTIVE', 'INACTIVE', 'ON_HOLD'].includes(params.status)
      ? (params.status as CustomerStatus)
      : undefined
  const type =
    typeof params.type === 'string' && params.type in TYPE_LABELS
      ? (params.type as CustomerType)
      : undefined

  // Everyone, to offer the cities and to count against; and the search matches.
  const [everyone, matched] = await Promise.all([
    listCustomers(),
    search ? listCustomers({ search }) : null,
  ])
  const cities = [
    ...new Set(everyone.map((customer) => customer.city).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const city =
    typeof params.city === 'string' && cities.includes(params.city) ? params.city : undefined

  const filtered = Boolean(search || status || type || city)
  const customers = sortRows(
    (matched ?? everyone).filter(
      (customer) =>
        (!status || customer.status === status) &&
        (!type || customer.type === type) &&
        (!city || customer.city === city),
    ),
    params,
    {
      code: (customer) => customer.code,
      name: (customer) => customer.name,
      phone: (customer) => customer.phone,
      city: (customer) => customer.city,
      architect: (customer) => customer.preferredArchitect?.name,
      carpenter: (customer) => customer.preferredCarpenter?.name,
      status: (customer) => STATUS_LABELS[customer.status],
    },
  )
  const canCreate = can(user.role, 'customer:create')
  const canEdit = can(user.role, 'customer:update')
  const canDelete = can(user.role, 'customer:delete')

  const paged = paginate(customers, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Customers</Heading>
          <Text>Everyone you quote and bill.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="customers" search={search} />
          {canCreate ? <Button href="/customers/new">Add customer</Button> : null}
        </div>
      </div>

      {created ? (
        <FormBanner
          tone="success"
          steps={
            createdId
              ? [
                  ...(can(user.role, 'quotation:create')
                    ? [{ label: 'Create quotation', href: `/quotations/new?customer=${createdId}` }]
                    : []),
                  ...(can(user.role, 'order:create')
                    ? [
                        {
                          label: `Create ${industry.terms.order.toLowerCase()}`,
                          href: `/orders/new?customer=${createdId}`,
                        },
                      ]
                    : []),
                ]
              : undefined
          }
        >
          Customer {created} saved
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name, code, phone, city, email…" />
        <StatusFilter
          options={[
            { value: 'all', label: 'All' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ON_HOLD', label: 'On hold' },
            { value: 'INACTIVE', label: 'Inactive' },
          ]}
          value={status ?? 'all'}
          params={params}
          pathname="/customers"
          paramKey="status"
          defaultValue="all"
        />
        <div className="contents">
          <FilterSelect
            param="type"
            label="Customer type"
            allLabel="All"
            value={type}
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            param="city"
            label="City"
            allLabel="All"
            value={city}
            options={cities.map((value) => ({ value, label: value }))}
          />
        </div>
      </div>

      {everyone.length > 0 ? (
        <ListSummary
          shown={customers.length}
          total={everyone.length}
          singular="customer"
          plural="customers"
          filtered={filtered}
          params={params}
          pathname="/customers"
        />
      ) : null}

      {customers.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No customers yet'}
          description={
            filtered
              ? 'No customer matches the current search and filters.'
              : 'Add your first customer to start raising quotations and orders.'
          }
          action={
            filtered ? (
              <Button outline href={clearHref('/customers', params)}>
                Clear filters
              </Button>
            ) : canCreate ? (
              <Button href="/customers/new">Add customer</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="code" label="Code" params={params} pathname="/customers" />
              <SortHeader column="name" label="Name" params={params} pathname="/customers" />
              <SortHeader column="phone" label="Phone" params={params} pathname="/customers" />
              <SortHeader column="city" label="City" params={params} pathname="/customers" />
              <SortHeader column="architect" label="Architect" params={params} pathname="/customers" />
              <SortHeader column="carpenter" label="Carpenter" params={params} pathname="/customers" />
              <SortHeader column="status" label="Status" params={params} pathname="/customers" />
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
