import { date, money } from '@/lib/format'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Heading } from '@/components/catalyst/heading'
import { Subheading } from '@/components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import { ConfirmButton } from '@/components/confirm-button'
import { DangerZone } from '@/components/danger-zone'
import { FormBanner } from '@/components/form-banner'
import { deleteVendor, updateVendor } from '@/lib/actions/vendors'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { can } from '@/lib/permissions'
import { getVendor } from '@/lib/queries/vendors'
import { requireCapability } from '@/lib/session'
import { VendorForm } from '../vendor-form'

export const metadata: Metadata = {
  title: 'Vendor',
}

export default async function VendorPage({
  params,
  searchParams,
}: PageProps<'/vendors/[id]'>) {
  const user = await requireCapability('expense:read')
  const { id } = await params
  const query = await searchParams
  const vendor = await getVendor(id)

  if (!vendor) {
    notFound()
  }

  const canEdit = can(user.role, 'expense:update')

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Heading>{vendor.name}</Heading>
          {vendor.isActive ? null : <Badge color="zinc">Inactive</Badge>}
        </div>
        {vendor.description ? <Text>{vendor.description}</Text> : null}
      </div>

      {query.created === '1' ? <FormBanner tone="success">Vendor saved</FormBanner> : null}

      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Paid so far</dt>
          <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{money.format(vendor.spent)}</dd>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Payments</dt>
          <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{vendor.bills}</dd>
        </div>
      </dl>

      {vendor.expenses.length > 0 ? (
        <div>
          <Subheading level={2}>Recent payments</Subheading>
          <div className="mt-4">
            <Table dense grid striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Expense</TableHeader>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Note</TableHeader>
                  <TableHeader>Paid by</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {vendor.expenses.map((expense) => (
                  <TableRow key={expense.id} href={`/expenses/${expense.id}`}>
                    <TableCell className="font-mono text-xs">{expense.number}</TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {date.format(expense.expenseDate)}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {expense.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      {expense.channel?.name ?? PAYMENT_MODE_LABELS[expense.paymentMode]}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money.format(expense.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <h2 className="text-sm/6 font-semibold text-zinc-950 dark:text-white">Vendor details</h2>
          <VendorForm
            action={updateVendor.bind(null, vendor.id)}
            submitLabel="Save changes"
            values={vendor}
          />
        </>
      ) : null}

      {can(user.role, 'expense:delete') ? (
        <DangerZone
          title="Delete vendor"
          description="Only possible while no expense refers to them. Otherwise mark them inactive."
        >
          <ConfirmButton
            label="Delete"
            title={`Delete ${vendor.name}?`}
            description="This permanently removes the vendor. This cannot be undone."
            confirmLabel="Delete vendor"
            redirectTo="/vendors"
            action={deleteVendor.bind(null, vendor.id)}
          />
        </DangerZone>
      ) : null}
    </div>
  )
}
