import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
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
import { getDispatch } from '@/lib/queries/dispatches'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  DISPATCH_STATUS_COLORS,
  DISPATCH_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { DispatchActions } from './dispatch-actions'
import { PrintButton } from '@/components/print-button'

export const metadata: Metadata = {
  title: 'Delivery challan',
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default async function DispatchDetailPage({
  params,
  searchParams,
}: PageProps<'/dispatch/[id]'>) {
  const user = await requireCapability('dispatch:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const [dispatch, company] = await Promise.all([
    getDispatch(id),
    getCompanySetting(),
  ])

  if (!dispatch) {
    notFound()
  }

  const canUpdate = can(user.role, 'dispatch:update')
  const editable = dispatch.status === 'DRAFT' || dispatch.status === 'DISPATCHED'

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-3">
            <Heading>{dispatch.number}</Heading>
            <Badge color={DISPATCH_STATUS_COLORS[dispatch.status]}>
              {DISPATCH_STATUS_LABELS[dispatch.status]}
            </Badge>
          </div>
          <Text>
            {dispatch.order.customer.name} ·{' '}
            <TextLink href={`/orders/${dispatch.order.id}`}>
              {dispatch.order.number}
            </TextLink>
          </Text>
        </div>
        <div className="flex gap-3">
          <PrintButton label="Print challan" />
          {canUpdate && editable ? (
            <Button href={`/dispatch/${dispatch.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {justCreated ? (
        <FormBanner tone="success">
          Delivery challan {dispatch.number} created
        </FormBanner>
      ) : null}

      <div className="print:hidden">
        <DispatchActions
          id={dispatch.id}
          status={dispatch.status}
          canUpdate={canUpdate}
        />
      </div>

      <Divider className="print:hidden" />

      <div className="hidden print:block">
        <div className="text-lg font-semibold">{company.companyName}</div>
        <div className="text-sm text-zinc-600">
          {[company.addressLine, company.city, company.state, company.pincode]
            .filter(Boolean)
            .join(', ')}
        </div>
        <div className="mt-4 text-base font-semibold">
          Delivery challan {dispatch.number}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>Deliver to</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{dispatch.order.customer.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {dispatch.order.customer.phone}
            </div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {[
                dispatch.deliveryAddress,
                dispatch.deliveryCity,
                dispatch.deliveryPincode,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Transport</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Vehicle: {dispatch.vehicleNumber ?? '—'}</div>
            <div>Driver: {dispatch.driverName ?? '—'}</div>
            <div>{dispatch.driverPhone ?? ''}</div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Consignment</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Transporter: {dispatch.transporterName ?? '—'}</div>
            <div>LR no: {dispatch.lrNumber ?? '—'}</div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Dispatched: {dateFormat.format(dispatch.dispatchDate)}</div>
            <div>
              Received:{' '}
              {dispatch.receivedAt ? timeFormat.format(dispatch.receivedAt) : '—'}
            </div>
          </div>
        </div>
      </div>

      <Divider />

      <Table dense grid>
        <TableHead>
          <TableRow>
            <TableHeader className="w-8">#</TableHeader>
            <TableHeader>Description</TableHeader>
            <TableHeader className="text-right">Quantity</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {dispatch.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                {line.position}
              </TableCell>
              <TableCell className="font-medium">{line.description}</TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity} {UNIT_SHORT[line.unit]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {dispatch.notes ? (
        <div>
          <Subheading level={2}>Notes</Subheading>
          <Text className="mt-2 whitespace-pre-line">{dispatch.notes}</Text>
        </div>
      ) : null}

      {dispatch.receivedByName ? (
        <div className="rounded-lg bg-lime-50 p-4 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:ring-lime-400/20">
          <div className="text-sm/6 font-medium">
            Received by {dispatch.receivedByName}
            {dispatch.receivedAt
              ? ` on ${timeFormat.format(dispatch.receivedAt)}`
              : ''}
          </div>
        </div>
      ) : (
        <div className="mt-8 hidden print:block">
          <div className="text-sm">Received in good condition</div>
          <div className="mt-10 border-t border-zinc-400 pt-1 text-xs text-zinc-600">
            Receiver's name and signature
          </div>
        </div>
      )}
    </div>
  )
}
