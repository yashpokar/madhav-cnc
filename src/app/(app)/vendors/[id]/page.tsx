import { date, money } from '@/lib/format'
import { modeText } from '@/lib/payment-modes'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
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
import { can } from '@/lib/permissions'
import { getVendor } from '@/lib/queries/vendors'
import { vendorPurchases } from '@/lib/queries/purchases'
import { BILL_PAYMENT_COLORS, BILL_PAYMENT_LABELS, BILL_STATUS_COLORS, BILL_STATUS_LABELS } from '@/lib/labels'
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
  const purchases = can(user.role, 'purchase:read') ? await vendorPurchases(vendor.id) : null

  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Heading>{vendor.name}</Heading>
          {vendor.isActive ? null : <Badge color="zinc">Inactive</Badge>}
        </div>
        {vendor.description ? <Text>{vendor.description}</Text> : null}
      </div>

      {query.created === '1' ? <FormBanner tone="success">Vendor saved</FormBanner> : null}

      <dl className="grid grid-cols-2 gap-4">
        <div className="surface-card p-4">
          <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Paid so far</dt>
          <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{money.format(vendor.spent)}</dd>
        </div>
        <div className="surface-card p-4">
          <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Payments</dt>
          <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{vendor.bills}</dd>
        </div>
      </dl>

      {purchases ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Subheading level={2}>Purchases</Subheading>
            <div className="flex flex-wrap gap-2">
              <Button outline href={`/vendors/${vendor.id}/statement`}>
                Statement
              </Button>
              {can(user.role, 'purchase:create') ? (
                <Button outline href={`/purchase-bills/new?vendor=${vendor.id}`}>
                  New bill
                </Button>
              ) : null}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div className="surface-card p-4">
              <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Billed (posted)</dt>
              <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{money.format(purchases.billed)}</dd>
            </div>
            <div className="surface-card p-4">
              <dt className="text-sm/5 text-zinc-500 dark:text-zinc-400">Outstanding</dt>
              <dd className="mt-1 text-2xl/8 font-semibold tabular-nums">{money.format(purchases.outstanding)}</dd>
            </div>
          </dl>
          {purchases.bills.length === 0 ? (
            <Text className="mt-4">No purchase bills for this vendor yet.</Text>
          ) : (
            <div className="mt-4">
              <Table dense grid striped>
                <TableHead>
                  <TableRow>
                    <TableHeader>Bill</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader className="text-right">Total</TableHeader>
                    <TableHeader className="text-right">Outstanding</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purchases.bills.map((bill) => (
                    <TableRow key={bill.id} href={`/purchase-bills/${bill.id}`}>
                      <TableCell className="font-mono text-xs">
                        {bill.number}
                        {bill.vendorBillNumber ? (
                          <div className="text-zinc-500 dark:text-zinc-400">{bill.vendorBillNumber}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {date.format(bill.billDate)}
                      </TableCell>
                      <TableCell>
                        <Badge color={BILL_STATUS_COLORS[bill.status]}>{BILL_STATUS_LABELS[bill.status]}</Badge>{' '}
                        {bill.paymentStatus ? (
                          <Badge color={BILL_PAYMENT_COLORS[bill.paymentStatus]}>
                            {BILL_PAYMENT_LABELS[bill.paymentStatus]}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money.format(bill.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bill.status === 'POSTED' ? money.format(bill.due) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : null}

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
                      {modeText(expense)}
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
            values={{
              name: vendor.name,
              contactName: vendor.contactName,
              phone: vendor.phone,
              email: vendor.email,
              gstin: vendor.gstin,
              address: vendor.address,
              city: vendor.city,
              description: vendor.description,
              isActive: vendor.isActive,
              openingPayable: vendor.openingPayable.toNumber(),
              openingAsOf: vendor.openingAsOf
                ? vendor.openingAsOf.toISOString().slice(0, 10)
                : null,
            }}
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
