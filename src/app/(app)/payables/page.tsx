import { moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { BanknotesIcon, ClockIcon, DocumentTextIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { SortHeader } from '@/components/sort-header'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { sortRows } from '@/lib/table-sort'
import { getPayables } from '@/lib/queries/payables'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Payables',
}

const PATH = '/payables'

export default async function PayablesPage({ searchParams }: PageProps<'/payables'>) {
  const user = await requireCapability('purchase:read')
  const params = await searchParams
  const q = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase()
  const data = await getPayables(new Date())
  const canPay = can(user.role, 'purchase:update')

  const matching = data.vendors.filter((row) => !q || row.name.toLowerCase().includes(q))
  const rows = sortRows(matching, params, {
    vendor: (row) => row.name,
    billed: (row) => row.billed,
    paid: (row) => row.paid,
    due: (row) => row.due,
    overdue: (row) => row.overdue,
    oldest: (row) => row.oldestDays,
    opening: (row) => row.opening,
  })
  const paged = paginate(rows, params)
  const sortParams = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'page'))

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Payables</Heading>
          <Text>What you owe your vendors, and how late it is.</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField placeholder="Search vendor…" />
          <Button outline href="/vendor-payments">
            Vendor payments
          </Button>
          {canPay ? <Button href="/vendor-payments/new">Record payment</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total payable"
          icon={<BanknotesIcon />}
          value={currency.format(data.totalPayable)}
          hint={`${data.openBillCount} open bill${data.openBillCount === 1 ? '' : 's'}${data.openingTotal > 0 ? ` and ${currency.format(data.openingTotal)} opening payable` : ''}`}
        />
        <StatCard
          label="Overdue"
          icon={<ClockIcon />}
          value={currency.format(data.overdue)}
          hint={data.overdue > 0 ? 'past the due date' : 'nothing past its due date'}
          tone={data.overdue > 0 ? 'bad' : 'neutral'}
        />
        <StatCard
          label="Open bills"
          icon={<DocumentTextIcon />}
          value={currency.format(data.billsDue)}
          hint="posted bills not fully paid"
        />
        <StatCard
          label="Advances to vendors"
          icon={<ArrowUturnLeftIcon />}
          value={currency.format(data.advances)}
          hint="paid but not yet applied to a bill"
        />
      </div>

      <div>
        <Subheading level={2}>Ageing</Subheading>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.aging.map((bucket) => (
            <div key={bucket.key} className="surface-card p-4">
              <div className="text-sm/5 text-zinc-500 dark:text-zinc-400">{bucket.label}</div>
              <div className="mt-1 text-lg/7 font-semibold tabular-nums">
                {currency.format(bucket.amount)}
              </div>
              <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                {bucket.count} item{bucket.count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Subheading level={2}>Owed by vendor</Subheading>
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState
              title={data.vendors.length === 0 ? 'Nothing owed' : 'No vendors match'}
              description={
                data.vendors.length === 0
                  ? 'Posted bills that are not fully paid appear here.'
                  : 'No vendor fits the current search.'
              }
              action={
                data.vendors.length === 0 ? null : (
                  <Button outline href={PATH}>
                    Clear search
                  </Button>
                )
              }
            />
          ) : (
            <>
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <SortHeader column="vendor" label="Vendor" params={sortParams} pathname={PATH} />
                    <SortHeader column="billed" label="Billed" params={sortParams} pathname={PATH} align="right" />
                    <SortHeader column="paid" label="Paid" params={sortParams} pathname={PATH} align="right" />
                    <SortHeader column="opening" label="Opening" params={sortParams} pathname={PATH} align="right" />
                    <SortHeader column="due" label="Due" params={sortParams} pathname={PATH} align="right" />
                    <SortHeader column="overdue" label="Overdue" params={sortParams} pathname={PATH} align="right" />
                    <SortHeader column="oldest" label="Oldest" params={sortParams} pathname={PATH} align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.rows.map((row) => (
                    <TableRow key={row.id} href={`/vendors/${row.id}/statement`}>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.advance > 0 ? (
                          <div className="text-xs/5 font-normal text-amber-600 dark:text-amber-400">
                            {currency.format(row.advance)} advance held
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{currency.format(row.billed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{currency.format(row.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.opening > 0 ? currency.format(row.opening) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {currency.format(row.due)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.overdue > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {currency.format(row.overdue)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.oldestDays > 0 ? `${row.oldestDays}d` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination paged={paged} params={params} pathname={PATH} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
