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
import { FormBanner } from '@/components/form-banner'
import { date as dateFormat, money as currency } from '@/lib/format'
import { UNIT_SHORT } from '@/lib/labels'
import { can } from '@/lib/permissions'
import { getReceipt } from '@/lib/queries/goods-receipts'
import { requireCapability } from '@/lib/session'
import { RECEIPT_STATUS_COLORS, RECEIPT_STATUS_LABELS } from '@/lib/receipt-labels'
import { ReceiptActions } from './receipt-actions'

export const metadata: Metadata = {
  title: 'Goods receipt',
}

export default async function ReceiptDetailPage({
  params,
  searchParams,
}: PageProps<'/goods-receipts/[id]'>) {
  const user = await requireCapability('purchase:read')
  const { id } = await params
  const query = await searchParams

  const receipt = await getReceipt(id)

  if (!receipt) notFound()

  const canCancel = can(user.role, 'stock:update') && receipt.status === 'POSTED'

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{receipt.number}</Heading>
            <Badge color={RECEIPT_STATUS_COLORS[receipt.status]}>
              {RECEIPT_STATUS_LABELS[receipt.status]}
            </Badge>
          </div>
          <Text>
            <TextLink href={`/vendors/${receipt.vendor.id}`}>{receipt.vendor.name}</TextLink>
            {receipt.po ? (
              <>
                {' · '}
                <TextLink href={`/purchase-orders/${receipt.po.id}`}>{receipt.po.number}</TextLink>
              </>
            ) : null}
            {receipt.bill ? (
              <>
                {' · '}
                <TextLink href={`/purchase-bills/${receipt.bill.id}`}>{receipt.bill.number}</TextLink>
              </>
            ) : null}
          </Text>
        </div>
        {canCancel ? (
          <div className="flex flex-wrap gap-2">
            <ReceiptActions
              id={receipt.id}
              number={receipt.number}
              canOverride={user.role === 'ADMIN'}
            />
          </div>
        ) : null}
      </div>

      {query.created === '1' ? (
        <FormBanner tone="success">Receipt {receipt.number} posted</FormBanner>
      ) : null}

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div>
          <Subheading level={2}>Received on</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            {dateFormat.format(receipt.receivedOn)}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Subheading level={2}>Notes</Subheading>
          <Text className="mt-2 whitespace-pre-line">{receipt.notes ?? '—'}</Text>
        </div>
      </div>

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Item</TableHeader>
              <TableHeader className="text-right">Quantity</TableHeader>
              <TableHeader className="text-right">Unit cost</TableHeader>
              <TableHeader>Stock</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {receipt.lines.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">
                  {line.name}
                  {line.code ? (
                    <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{line.code}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.qty} {line.unit ? UNIT_SHORT[line.unit] : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">{currency.format(line.unitCost)}</TableCell>
                <TableCell>
                  {line.tracked ? (
                    <TextLink
                      href={`/stock/${line.itemId ? 'item' : 'material'}/${line.itemId ?? line.materialId}`}
                    >
                      View ledger
                    </TextLink>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">Not tracked</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ActivityTimeline entity="goods-receipt" id={receipt.id} />
    </div>
  )
}
