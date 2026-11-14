import { date as dateFormat, moneyWhole as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { Pagination } from '@/components/pagination'
import { paginate } from '@/lib/pagination'
import { ListControls } from '@/components/list-controls'
import { amountCeiling, applyListControls } from '@/lib/list-controls'
import { RowActions } from '@/components/row-actions'
import { deleteQuotation } from '@/lib/actions/quotations'
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
import { SearchField } from '@/components/search-field'
import { StatusFilter } from '@/components/status-filter'
import { SortHeader } from '@/components/sort-header'
import { sortRows } from '@/lib/table-sort'
import { ListEmpty, ResultCount, isFiltered } from '@/components/list-filter-ui'
import { countQuotations, listQuotations } from '@/lib/queries/quotations'
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

export default async function QuotationsPage({
  searchParams,
}: PageProps<'/quotations'>) {
  const user = await requireCapability('quotation:read')
  const params = await searchParams

  const tabValue = typeof params.tab === 'string' ? params.tab : 'all'
  const activeTab = TABS.find((tab) => tab.value === tabValue) ?? TABS[0]
  const search = typeof params.q === 'string' ? params.q : undefined

  const [quotations, totalCount] = await Promise.all([
    listQuotations({ status: activeTab.status, search }),
    countQuotations(),
  ])
  const canCreate = can(user.role, 'quotation:create')
  const canEdit = can(user.role, 'quotation:update')
  const canDelete = can(user.role, 'quotation:delete')

  const filtered = applyListControls(quotations, params, {
    date: (row) => row.quotationDate,
    amount: (row) => row.total,
  })
  const sorted = sortRows(filtered, params, {
    number: (row) => row.number,
    customer: (row) => row.customer.name,
    subject: (row) => row.subject,
    material: (row) => MATERIAL_SUMMARY_LABELS[row.materialSummary],
    date: (row) => row.quotationDate,
    lines: (row) => row._count.lines,
    total: (row) => row.total,
    status: (row) => QUOTATION_STATUS_LABELS[row.status],
  })
  const paged = paginate(sorted, params)
  const isNarrowed = isFiltered(params, activeTab.value)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Quotations</Heading>
          <Text>
            {totalCount} quotation{totalCount === 1 ? '' : 's'}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="quotations" search={search} status={activeTab.status} />
          {canCreate ? (
            <Button href="/quotations/new">New quotation</Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search number, customer, subject, architect…" />
        <StatusFilter
          options={TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          value={activeTab.value}
          params={params}
          pathname="/quotations"
        />
        <ListControls
          ceiling={amountCeiling(quotations, (row) => row.total)}
          params={params} pathname="/quotations" amountLabel="Total" />
      </div>

      {sorted.length === 0 ? (
        <ListEmpty
          filtered={isNarrowed}
          pathname="/quotations"
          params={params}
          noun="quotation"
          emptyTitle="No quotations yet"
          emptyDescription="Raise your first quotation against a customer."
          action={canCreate ? <Button href="/quotations/new">New quotation</Button> : null}
        />
      ) : (
<>
        <ResultCount shown={sorted.length} total={totalCount} noun="quotation" filtered={isNarrowed} />
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <SortHeader column="number" label="Number" params={params} pathname="/quotations" />
              <SortHeader column="customer" label="Customer" params={params} pathname="/quotations" />
              <SortHeader column="subject" label="Subject" params={params} pathname="/quotations" />
              <SortHeader column="material" label="Material" params={params} pathname="/quotations" />
              <SortHeader column="date" label="Date" params={params} pathname="/quotations" />
              <SortHeader column="lines" label="Lines" params={params} pathname="/quotations" align="right" />
              <SortHeader column="total" label="Total" params={params} pathname="/quotations" align="right" />
              <SortHeader column="status" label="Status" params={params} pathname="/quotations" />
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
                      canDelete
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
