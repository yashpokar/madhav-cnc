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
import { PrintButton } from '@/components/print-button'
import { DocumentLetterhead } from '@/components/document-letterhead'
import { getNote } from '@/lib/queries/accounting'
import { getCompanySetting } from '@/lib/queries/company'
import { can } from '@/lib/permissions'
import { requireCapability } from '@/lib/session'
import {
  NOTE_KIND_COLORS,
  NOTE_KIND_LABELS,
  NOTE_PARTY_LABELS,
  NOTE_REASON_LABELS,
  NOTE_STATUS_COLORS,
  NOTE_STATUS_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { NoteActions } from './note-actions'

export const metadata: Metadata = {
  title: 'Note',
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

export default async function NoteDetailPage({
  params,
  searchParams,
}: PageProps<'/notes/[id]'>) {
  const user = await requireCapability('note:read')
  const { id } = await params
  const query = await searchParams
  const justCreated = query.created === '1'

  const [note, company] = await Promise.all([getNote(id), getCompanySetting()])

  if (!note) {
    notFound()
  }

  const canUpdate = can(user.role, 'note:update')
  const party = note.customer?.name ?? note.vendorName ?? '—'
  const gstin = note.customer?.gstin ?? note.vendorGstin

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading>{note.number}</Heading>
            <Badge color={NOTE_KIND_COLORS[note.kind]}>
              {NOTE_KIND_LABELS[note.kind]}
            </Badge>
            <Badge color={NOTE_STATUS_COLORS[note.status]}>
              {NOTE_STATUS_LABELS[note.status]}
            </Badge>
          </div>
          <Text>
            {party}
            {note.invoice ? (
              <>
                {' · '}
                <TextLink href={`/invoices/${note.invoice.id}`}>
                  {note.invoice.number}
                </TextLink>
              </>
            ) : null}
          </Text>
        </div>
        <div className="flex gap-3">
          <PrintButton label="Print note" />
          {canUpdate && note.status === 'DRAFT' ? (
            <Button href={`/notes/${note.id}/edit`}>Edit</Button>
          ) : null}
        </div>
      </div>

      {justCreated ? (
        <FormBanner tone="success">{note.number} created</FormBanner>
      ) : null}

      <div className="print:hidden">
        <NoteActions
          id={note.id}
          status={note.status}
          canUpdate={canUpdate}
          canDelete={can(user.role, 'note:delete')}
        />
      </div>

      <DocumentLetterhead
        company={company}
        title={NOTE_KIND_LABELS[note.kind]}
        reference={note.number}
        date={note.noteDate}
      />

      <Divider className="print:hidden" />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Subheading level={2}>{NOTE_PARTY_LABELS[note.partyType]}</Subheading>
          <div className="mt-2 text-sm/6">
            <div className="font-medium">{party}</div>
            {note.customer ? (
              <div className="text-zinc-500 dark:text-zinc-400">
                {[
                  note.customer.address,
                  note.customer.city,
                  note.customer.state,
                  note.customer.pincode,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </div>
            ) : null}
            {gstin ? (
              <div className="text-zinc-500 dark:text-zinc-400">
                GSTIN {gstin}
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <Subheading level={2}>Reason</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>{NOTE_REASON_LABELS[note.reason]}</div>
            {note.invoice ? (
              <div>
                Against {note.invoice.number} of{' '}
                {dateFormat.format(note.invoice.invoiceDate)}
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <Subheading level={2}>Supply</Subheading>
          <div className="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <div>Place: {note.placeOfSupply ?? '—'}</div>
            <div>
              {note.isInterState
                ? 'Inter-state (IGST)'
                : 'Intra-state (CGST + SGST)'}
            </div>
            <div>Date: {dateFormat.format(note.noteDate)}</div>
          </div>
        </div>
        <div>
          <Subheading level={2}>Note value</Subheading>
          <div className="mt-2 text-2xl/8 font-semibold tabular-nums">
            {currency.format(note.total)}
          </div>
        </div>
      </div>

      <Divider />

      <div className="overflow-x-auto">
        <Table dense grid>
          <TableHead>
            <TableRow>
              <TableHeader className="w-8">#</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>HSN</TableHeader>
              <TableHeader className="text-right">Qty</TableHeader>
              <TableHeader className="text-right">Rate</TableHeader>
              <TableHeader className="text-right">Taxable</TableHeader>
              {note.isInterState ? (
                <TableHeader className="text-right">IGST</TableHeader>
              ) : (
                <>
                  <TableHeader className="text-right">CGST</TableHeader>
                  <TableHeader className="text-right">SGST</TableHeader>
                </>
              )}
              <TableHeader className="text-right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {note.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {line.position}
                </TableCell>
                <TableCell className="font-medium">{line.description}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {line.hsnCode ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity} {UNIT_SHORT[line.unit]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency.format(line.amount)}
                </TableCell>
                {note.isInterState ? (
                  <TableCell className="text-right tabular-nums">
                    {currency.format(line.igstAmount)}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(line.cgstAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(line.sgstAmount)}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-right font-medium tabular-nums">
                  {currency.format(line.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <dl className="grid w-full grid-cols-2 gap-y-2 text-sm/6 sm:max-w-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
          <dd className="text-right tabular-nums">
            {currency.format(note.taxableAmount)}
          </dd>
          {note.isInterState ? (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">IGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(note.igstAmount)}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-zinc-500 dark:text-zinc-400">CGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(note.cgstAmount)}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">SGST</dt>
              <dd className="text-right tabular-nums">
                {currency.format(note.sgstAmount)}
              </dd>
            </>
          )}
          <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
          <dd className="text-right tabular-nums">
            {currency.format(note.roundOff)}
          </dd>
          <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
            Total
          </dt>
          <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
            {currency.format(note.total)}
          </dd>
        </dl>
      </div>

      {note.reasonNote ? (
        <>
          <Divider />
          <div>
            <Subheading level={2}>Detail</Subheading>
            <Text className="mt-2 whitespace-pre-line">{note.reasonNote}</Text>
          </div>
        </>
      ) : null}
    </div>
  )
}
