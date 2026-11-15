import { ActivityTimeline } from '@/components/activity-timeline'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Divider } from '@/components/catalyst/divider'
import { Heading, Subheading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text, TextLink } from '@/components/catalyst/text'
import { date as dateFormat, money } from '@/lib/format'
import { UNIT_SHORT } from '@/lib/labels'
import { can } from '@/lib/permissions'
import { getStockLedger, getStockSubject } from '@/lib/queries/stock'
import { requireCapability } from '@/lib/session'
import { todayIso } from '@/lib/purchase-rules'
import { MOVEMENT_LABELS, STOCK_STATE_COLORS, STOCK_STATE_LABELS } from '@/lib/receipt-labels'
import { stockState } from '@/lib/stock-rules'
import type { UnitOfMeasure } from '@/generated/prisma/enums'
import { StockAdjust } from './stock-adjust'

export const metadata: Metadata = {
  title: 'Stock ledger',
}

export default async function StockLedgerPage({ params }: PageProps<'/stock/[kind]/[id]'>) {
  const user = await requireCapability('stock:read')
  const { kind, id } = await params

  if (kind !== 'item' && kind !== 'material') notFound()

  const subject = await getStockSubject(kind, id)

  if (!subject) notFound()

  const ledger = await getStockLedger(kind, id)
  const state = stockState(ledger.onHand, subject.reorderLevel)
  const unit = subject.unit ? UNIT_SHORT[subject.unit as UnitOfMeasure] : ''

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Heading>{subject.name}</Heading>
          {state === 'ok' ? null : (
            <Badge color={STOCK_STATE_COLORS[state]}>{STOCK_STATE_LABELS[state]}</Badge>
          )}
        </div>
        <Text>
          {subject.code ?? 'Material'} ·{' '}
          <TextLink href={kind === 'item' ? `/items/${id}` : '/items/materials'}>
            {kind === 'item' ? 'Open item' : 'Manage materials'}
          </TextLink>
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        <div>
          <Subheading level={2}>On hand</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {ledger.onHand} {unit}
          </div>
        </div>
        <div>
          <Subheading level={2}>Average cost</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {ledger.averageCost > 0 ? money.format(ledger.averageCost) : '—'}
          </div>
        </div>
        <div>
          <Subheading level={2}>Value</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {ledger.value > 0 ? money.format(ledger.value) : '—'}
          </div>
        </div>
        <div>
          <Subheading level={2}>Reorder level</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {subject.reorderLevel ?? '—'}
          </div>
        </div>
      </div>

      {can(user.role, 'stock:create') ? (
        <StockAdjust
          kind={kind}
          id={id}
          today={todayIso()}
          canSetOpening={!ledger.hasOpening}
          tracked={subject.stockTracked}
        />
      ) : null}

      <Divider />

      {ledger.rows.length === 0 ? (
        <Text>No movements yet.</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table dense grid>
            <TableHead>
              <TableRow>
                <TableHeader>Date</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader className="text-right">Quantity</TableHeader>
                <TableHeader className="text-right">Unit cost</TableHeader>
                <TableHeader>Reference</TableHeader>
                <TableHeader className="text-right">Balance</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...ledger.rows].reverse().map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{dateFormat.format(row.date)}</TableCell>
                  <TableCell>{MOVEMENT_LABELS[row.type]}</TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      row.qty < 0 ? 'text-red-600 dark:text-red-400' : ''
                    }`}
                  >
                    {row.qty > 0 ? '+' : ''}
                    {row.qty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.unitCost > 0 ? money.format(row.unitCost) : '—'}
                  </TableCell>
                  <TableCell>
                    {row.receiptId && row.reference ? (
                      <TextLink href={`/goods-receipts/${row.receiptId}`}>{row.reference}</TextLink>
                    ) : (
                      (row.reference ?? '—')
                    )}
                    {row.note ? (
                      <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">{row.note}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.balance}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ActivityTimeline entity="stock" id={id} />
    </div>
  )
}
