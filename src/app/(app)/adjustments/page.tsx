import { date as dateFormat, money as currency } from '@/lib/format'
import type { Metadata } from 'next'
import { AdjustmentRowActions } from '@/components/adjustment-row-actions'
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
import { DateRangeFilter } from '@/components/date-range-filter'
import { FilterSelect } from '@/components/filter-select'
import { EmptyState } from '@/components/form-banner'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { BalanceAdjustmentKind, BalanceAdjustmentReason } from '@/generated/prisma/enums'
import { ADJUSTMENT_REASON_LABELS } from '@/lib/labels'
import { readDateRange } from '@/lib/list-controls'
import { paginate } from '@/lib/pagination'
import { can } from '@/lib/permissions'
import { listAdjustments } from '@/lib/queries/adjustments'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Balance adjustments',
}

const KIND_LABELS: Record<BalanceAdjustmentKind, string> = {
  CHANNEL: 'Cash and bank',
  CUSTOMER: 'Customer dues',
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function AdjustmentsPage({ searchParams }: PageProps<'/adjustments'>) {
  const user = await requireCapability('payment:read')
  const params = await searchParams

  const search = typeof params.q === 'string' ? params.q : undefined
  const kind = Object.values(BalanceAdjustmentKind).find((value) => value === one(params.kind))
  const reason = Object.values(BalanceAdjustmentReason).find((value) => value === one(params.reason))
  const { from, to } = readDateRange(params)

  const rows = await listAdjustments({ search, kind, reason, from, to })
  const paged = paginate(rows, params)
  const canEdit = can(user.role, 'settings:update')
  const filtered = Boolean(search || kind || reason || from || to)

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <Link
          href="/settings/opening-balances"
          className="text-sm/5 text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Opening balances
        </Link>
        <Heading>Balance adjustments</Heading>
        <Text className="max-w-2xl">
          Every correction to a cash or bank balance, or to what a customer owes, is listed here
          with its date, reason and note. Nothing is edited silently: to fix a balance, add an
          adjustment, and delete it to undo it.
        </Text>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search number, note, customer, mode…" />
        <FilterSelect
          param="kind"
          label="Type"
          allLabel="All"
          value={kind}
          options={Object.values(BalanceAdjustmentKind).map((value) => ({
            value,
            label: KIND_LABELS[value],
          }))}
        />
        <FilterSelect
          param="reason"
          label="Reason"
          allLabel="All"
          value={reason}
          options={Object.values(BalanceAdjustmentReason).map((value) => ({
            value,
            label: ADJUSTMENT_REASON_LABELS[value],
          }))}
        />
        <DateRangeFilter defaultFrom={from} defaultTo={to} label="Date" autoSubmit />
        {filtered ? (
          <Button plain href="/adjustments">
            Clear
          </Button>
        ) : null}
      </form>

      {paged.total === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No adjustments yet'}
          description={
            filtered
              ? 'No adjustments fit the current search and filters.'
              : 'Use Adjust balance on a payment mode or a customer to record one.'
          }
        />
      ) : (
        <>
          <Table dense grid striped>
            <TableHead>
              <TableRow>
                <TableHeader>Number</TableHeader>
                <TableHeader>Date</TableHeader>
                <TableHeader>Adjusts</TableHeader>
                <TableHeader>Reason</TableHeader>
                <TableHeader>Note</TableHeader>
                <TableHeader className="text-right">Effect</TableHeader>
                {canEdit ? (
                  <TableHeader>
                    <span className="sr-only">Actions</span>
                  </TableHeader>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.rows.map((row) => {
                const name = row.channel?.name ?? row.customer?.name ?? '—'
                // Cash/bank: + adds money. Customer: + means they owe more.
                const good = row.kind === 'CHANNEL' ? row.amount > 0 : row.amount < 0

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.number}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {dateFormat.format(row.adjustedOn)}
                    </TableCell>
                    <TableCell>
                      {row.customer ? (
                        <Link href={`/customers/${row.customer.id}/statement`} className="font-medium hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="font-medium">{name}</span>
                      )}
                      <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                        {KIND_LABELS[row.kind]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">{ADJUSTMENT_REASON_LABELS[row.reason]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-zinc-500 dark:text-zinc-400">
                      {row.note}
                      {row.reverses ? (
                        <div className="mt-1">
                          <Badge color="amber">Reversal of {row.reverses.number}</Badge>
                        </div>
                      ) : null}
                      {row.reversedBy ? (
                        <div className="mt-1">
                          <Badge color="zinc">Reversed by {row.reversedBy.number}</Badge>
                        </div>
                      ) : null}
                      {row.createdBy ? (
                        <div className="text-xs/5">by {row.createdBy.name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${good ? 'text-lime-700 dark:text-lime-400' : 'text-rose-600 dark:text-rose-400'}`}
                    >
                      {row.amount > 0 ? '+' : '−'}
                      {currency.format(Math.abs(row.amount))}
                      <div className="text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                        {row.kind === 'CHANNEL'
                          ? row.amount > 0
                            ? 'Money added'
                            : 'Money removed'
                          : row.amount > 0
                            ? 'Owes more'
                            : 'Owes less'}
                      </div>
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <AdjustmentRowActions
                          number={row.number}
                          target={{
                            kind: row.kind,
                            id: (row.channel?.id ?? row.customer?.id) as string,
                            name,
                          }}
                          reversal={row.reverses ? 'of' : row.reversedBy ? 'by' : null}
                          existing={{
                            id: row.id,
                            amount: row.amount,
                            adjustedOn: row.adjustedOn.toISOString().slice(0, 10),
                            reason: row.reason,
                            note: row.note,
                          }}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination paged={paged} params={params} pathname="/adjustments" />
        </>
      )}
    </div>
  )
}
