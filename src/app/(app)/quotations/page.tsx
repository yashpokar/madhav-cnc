import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteQuotation } from '@/lib/actions/quotations'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { ExportButton } from '@/components/export-button'
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
import { EmptyState } from '@/components/form-banner'
import { SearchField } from '@/components/search-field'
import { listQuotations } from '@/lib/queries/quotations'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  MATERIAL_SUMMARY_COLORS,
  MATERIAL_SUMMARY_LABELS,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
} from '@/lib/labels'
import { QuotationStatus } from '@/generated/prisma/enums'

export const metadata: Metadata = {
  title: 'Quotations',
}

const TABS: { label: string; value: string; status?: QuotationStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft', status: 'DRAFT' },
  { label: 'Sent', value: 'sent', status: 'SENT' },
  { label: 'Accepted', value: 'accepted', status: 'ACCEPTED' },
]

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function QuotationsPage({
  searchParams,
}: PageProps<'/quotations'>) {
  const user = await requireCapability('quotation:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const quotations = await listQuotations({ status: activeTab.status, search })
  const canCreate = can(user.role, 'quotation:create')
  const canEdit = can(user.role, 'quotation:update')
  const canDelete = can(user.role, 'quotation:delete')

  const sorted = applyListControls(quotations, params, {
    date: (row) => row.quotationDate,
    amount: (row) => row.total,
  })
  const paged = paginate(sorted, params)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Quotations</Heading>
          <Text>
            {quotations.length} quotation{quotations.length === 1 ? '' : 's'}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="quotations" search={search} status={activeTab.status} />
          {canCreate ? (
            <Button href="/quotations/new">New quotation</Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {TABS.map((tab) => {
            const isActive = tab.value === activeTab.value
            const query = new URLSearchParams()

            if (tab.value !== 'all') query.set('tab', tab.value)
            if (search) query.set('q', search)

            const href = query.toString()
              ? `/quotations?${query.toString()}`
              : '/quotations'

            return (
              <Link
                key={tab.value}
                href={href}
                className={
                  isActive
                    ? 'shrink-0 rounded-md bg-white px-3 py-1.5 text-sm/5 font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white'
                    : 'shrink-0 rounded-md px-3 py-1.5 text-sm/5 font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <SearchField placeholder="Search number, customer, subject…" />
      </div>

      <ListControls params={params} pathname="/quotations" amountLabel="Total" />

      {quotations.length > 0 && sorted.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Nothing falls in this amount range. Widen it or clear the filter."
        />
      ) : quotations.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No quotations yet'}
          description={
            search
              ? 'Try a different number, customer or subject.'
              : 'Raise your first quotation against a customer.'
          }
          action={
            canCreate && !search ? (
              <Button href="/quotations/new">New quotation</Button>
            ) : null
          }
        />
      ) : (
<>
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Number</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Subject</TableHeader>
              <TableHeader>Material</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader className="text-right">Lines</TableHeader>
              <TableHeader className="text-right">Total</TableHeader>
              <TableHeader>Status</TableHeader>
            <TableHeader><span className="sr-only">Actions</span></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.rows.map((quotation) => (
              <TableRow key={quotation.id} href={`/quotations/${quotation.id}`}>
                <TableCell className="font-mono text-xs">
                  {quotation.number}
                  {quotation.revision > 1 ? (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {' '}
                      R{quotation.revision}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{quotation.customer.name}</div>
                  {quotation.architect ? (
                    <div className="text-zinc-500 dark:text-zinc-400">
                      via {quotation.architect.name}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {quotation.subject ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge color={MATERIAL_SUMMARY_COLORS[quotation.materialSummary]}>
                    {MATERIAL_SUMMARY_LABELS[quotation.materialSummary]}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(quotation.quotationDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {quotation._count.lines}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(quotation.total)}
                </TableCell>
                <TableCell>
                  <Badge color={QUOTATION_STATUS_COLORS[quotation.status]}>
                    {QUOTATION_STATUS_LABELS[quotation.status]}
                  </Badge>
                </TableCell>
              <TableCell>
                  <RowActions
                    name={quotation.number}
                    viewHref={`/quotations/${quotation.id}`}
                    editHref={canEdit && (quotation.status !== 'CONVERTED') ? `/quotations/${quotation.id}/edit` : undefined}
                    deleteAction={
                      canDelete && (['DRAFT', 'REJECTED', 'EXPIRED'].includes(quotation.status))
                        ? deleteQuotation.bind(null, quotation.id)
                        : undefined
                    }
                    deleteTitle={`Delete ${quotation.number}?`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
<Pagination paged={paged} params={params} pathname="/quotations" />
</>
      )}
    </div>
  )
}
