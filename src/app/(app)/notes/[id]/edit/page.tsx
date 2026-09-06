import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateNote } from '@/lib/actions/notes'
import {
  getNote,
  listCustomersForPicker,
  listInvoicesForPicker,
} from '@/lib/queries/accounting'
import { getCompanySetting } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { NOTE_KIND_LABELS } from '@/lib/labels'
import { NoteForm } from '../../note-form'

export const metadata: Metadata = {
  title: 'Edit note',
}

export default async function EditNotePage({
  params,
}: PageProps<'/notes/[id]/edit'>) {
  await requireCapability('note:update')
  const { id } = await params

  const [note, customers, invoices, company] = await Promise.all([
    getNote(id),
    listCustomersForPicker(),
    listInvoicesForPicker(),
    getCompanySetting(),
  ])

  if (!note) {
    notFound()
  }

  if (note.status !== 'DRAFT') {
    redirect(`/notes/${note.id}`)
  }

  const action = updateNote.bind(null, note.id)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{note.number}</Heading>
        <Text>{NOTE_KIND_LABELS[note.kind]} · draft</Text>
      </div>

      <NoteForm
        action={action}
        submitLabel="Save changes"
        customers={customers}
        invoices={invoices}
        companyState={company.state}
        lockKind
        values={{
          kind: note.kind,
          partyType: note.partyType,
          reason: note.reason,
          customerId: note.customerId,
          vendorName: note.vendorName,
          vendorGstin: note.vendorGstin,
          invoiceId: note.invoiceId,
          noteDate: note.noteDate.toISOString().slice(0, 10),
          placeOfSupply: note.placeOfSupply,
          isInterState: note.isInterState,
          reasonNote: note.reasonNote,
          lines: note.lines.map((line) => ({
            key: line.id,
            description: line.description,
            hsnCode: line.hsnCode ?? '',
            unit: line.unit,
            quantity: String(line.quantity),
            rate: String(line.rate),
            taxRatePercent: String(line.taxRatePercent),
          })),
        }}
      />
    </div>
  )
}
