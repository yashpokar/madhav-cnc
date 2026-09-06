import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createNote } from '@/lib/actions/notes'
import {
  listCustomersForPicker,
  listInvoicesForPicker,
} from '@/lib/queries/accounting'
import { getCompanySetting } from '@/lib/queries/company'
import { requireCapability } from '@/lib/session'
import { NOTE_KIND_DESCRIPTIONS, NOTE_KIND_LABELS } from '@/lib/labels'
import type { NoteKind } from '@/generated/prisma/enums'
import { NoteForm } from '../note-form'

export const metadata: Metadata = {
  title: 'New note',
}

export default async function NewNotePage({
  searchParams,
}: PageProps<'/notes/new'>) {
  await requireCapability('note:create')
  const params = await searchParams

  const kind: NoteKind = params.kind === 'DEBIT' ? 'DEBIT' : 'CREDIT'
  const partyType = kind === 'DEBIT' ? 'VENDOR' : 'CUSTOMER'

  const [customers, invoices, company] = await Promise.all([
    listCustomersForPicker(),
    listInvoicesForPicker(),
    getCompanySetting(),
  ])

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>New {NOTE_KIND_LABELS[kind].toLowerCase()}</Heading>
        <Text>{NOTE_KIND_DESCRIPTIONS[kind]}</Text>
      </div>

      <NoteForm
        action={createNote}
        submitLabel="Save note"
        customers={customers}
        invoices={invoices}
        companyState={company.state}
        values={{
          kind,
          partyType,
          reason: kind === 'DEBIT' ? 'PURCHASE_RETURN' : 'SALES_RETURN',
          customerId: null,
          vendorName: null,
          vendorGstin: null,
          invoiceId: null,
          noteDate: new Date().toISOString().slice(0, 10),
          placeOfSupply: company.state,
          isInterState: false,
          reasonNote: null,
          lines: [],
        }}
      />
    </div>
  )
}
