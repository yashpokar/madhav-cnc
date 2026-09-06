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
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { getQuotation, summariseMaterial } from '@/lib/queries/quotations'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  DIMENSION_UNIT_SHORT,
  MATERIAL_SUMMARY_COLORS,
  MATERIAL_SUMMARY_LABELS,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { StatusActions } from './status-actions'
import { DesignReferences } from './design-references'
import { SharePanel } from './share-panel'
import { PaymentTerms } from '@/components/payment-terms'
import { getCompanySetting } from '@/lib/queries/company'

export const metadata: Metadata = {
  title: 'Quotation',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export default async function QuotationDetailPage({
  params,
  searchParams,
}: PageProps<'/quotations/[id]'>) {
  const user = await requireCapability('quotation:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const [quotation, company] = await Promise.all([
    getQuotation(id),
    getCompanySetting(),
  ])

  if (!quotation) {
    notFound()
  }

  const materialSummary = summariseMaterial(quotation.lines)
  const canUpdate = can(user.role, 'quotation:update')
  const canCreate = can(user.role, 'quotation:create')
  const canCreateOrder = can(user.role, 'order:create')
  const editable = quotation.status !== 'CONVERTED'

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-3">
            <Heading>
              {quotation.number}
              {quotation.revision > 1 ? ` R${quotation.revision}` : ''}
            </Heading>
            <Badge color={QUOTATION_STATUS_COLORS[quotation.status]}>
              {QUOTATION_STATUS_LABELS[quotation.status]}
            </Badge>
            <Badge color={MATERIAL_SUMMARY_COLORS[materialSummary]}>
              {MATERIAL_SUMMARY_LABELS[materialSummary]}
            </Badge>
          </div>
          <Text>
            {quotation.customer.name}
            {quotation.subject ? ` · ${quotation.subject}` : ''}
          </Text>
        </div>
        {canUpdate && editable ? (
          <Button href={`/quotations/${quotation.id}/edit`}>Edit</Button>
        ) : null}
      </div>

      {justCreated ? (
        <FormBanner tone="success">
          Quotation {quotation.number} created
        </FormBanner>
      ) : null}

      <StatusActions
        id={quotation.id}
        status={quotation.status}
        canUpdate={canUpdate}
        canCreate={canCreate}
        canCreateOrder={canCreateOrder}
      />

      <Divider />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>Customer</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{quotation.customer.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {quotation.customer.code} · {quotation.customer.phone}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Referred by</Subheading>
          <div className="mt-2 text-sm/6">
            <div>
              Architect:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {quotation.architect?.name ?? '—'}
              </span>
            </div>
            <div>
              Carpenter:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {quotation.carpenter?.name ?? '—'}
              </span>
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Material</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">
              {MATERIAL_SUMMARY_LABELS[materialSummary]}
            </div>
            <div className="text-zinc-500 dark:text-zinc-400">
              {materialSummary === 'WITHOUT'
                ? 'Customer supplies all material; job work only.'
                : materialSummary === 'MIXED'
                  ? 'Some lines use customer material, some ours.'
                  : 'We supply the material and do the work.'}
            </div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Dates</Subheading>
          <div className="mt-2 text-sm/6">
            <div>
              Raised:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {dateFormat.format(quotation.quotationDate)}
              </span>
            </div>
            <div>
              Valid until:{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                {quotation.validUntil
                  ? dateFormat.format(quotation.validUntil)
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {quotation.siteAddress || quotation.siteCity ? (
        <div>
          <Subheading level={2}>Site</Subheading>
          <Text className="mt-2">
            {[quotation.siteAddress, quotation.siteCity, quotation.sitePincode]
              .filter(Boolean)
              .join(', ')}
          </Text>
        </div>
      ) : null}

      <Divider />

      <SharePanel
        quotationId={quotation.id}
        share={quotation.shares[0] ?? null}
        canManage={canUpdate}
      />

      <Divider />

      <DesignReferences
        quotationId={quotation.id}
        attachments={quotation.attachments}
        canEdit={canUpdate}
        locked={quotation.status === 'CONVERTED'}
      />

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Size</TableHeader>
              <TableHeader className="text-right">Qty</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">Disc</TableHeader>
              <TableHeader className="text-right">GST</TableHeader>
              <TableHeader className="text-right">Amount</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotation.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.position}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{line.description}</span>
                    {line.materialSupply === 'WITHOUT_MATERIAL' ? (
                      <Badge color="orange">Job work</Badge>
                    ) : null}
                  </div>
                  {line.hsnCode ? (
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      HSN {line.hsnCode}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {line.dimensionUnit && line.length && line.width
                    ? `${line.length} × ${line.width} ${DIMENSION_UNIT_SHORT[line.dimensionUnit]}${
                        line.pieces ? ` × ${line.pieces}` : ''
                      }`
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.discountPercent > 0 ? `${line.discountPercent}%` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.taxRatePercent}%
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(line.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <dl className="grid w-full max-w-sm grid-cols-2 gap-y-2 text-sm/6">
          <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.subtotal)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
          <dd className="text-right tabular-nums">
            −{currency.format(quotation.discountAmount)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.taxableAmount)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">GST</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.taxAmount)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
          <dd className="text-right tabular-nums">
            {currency.format(quotation.roundOff)}
          </dd>
          <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right text-base/6 font-semibold tabular-nums dark:border-white/10">
            {currency.format(quotation.total)}
          </dd>
        </dl>
      </div>

      <Divider />

      <PaymentTerms
        total={quotation.total}
        advancePercent={quotation.advancePercent}
        company={company}
        qrSrc={company.upiQrStoredName ? '/api/company/qr' : null}
      />

      {quotation.notes || quotation.terms ? (
        <>
          <Divider />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {quotation.notes ? (
              <div>
                <Subheading level={2}>Notes</Subheading>
                <Text className="mt-2 whitespace-pre-line">
                  {quotation.notes}
                </Text>
              </div>
            ) : null}
            {quotation.terms ? (
              <div>
                <Subheading level={2}>Terms &amp; conditions</Subheading>
                <Text className="mt-2 whitespace-pre-line">
                  {quotation.terms}
                </Text>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
