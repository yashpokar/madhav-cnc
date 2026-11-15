// Credit and debit note writes as plain functions that take the acting user
// and validated data (noteInputSchema), so the server actions and the mobile
// API run the same code. No session, cookies, redirects or revalidatePath.
//
// Runs inside a company scope (web: active-company cookie; API: X-Company-Id):
// the scope layer filters and stamps every row, so no companyId is accepted
// from callers and another company's notes are "not found". The caller checks
// the note:* capability. Activity is logged here.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextNoteNumber } from '@/lib/codes'
import { documentTotals, lineTotals, splitGst } from '@/lib/pricing'
import type { NoteData } from '@/lib/validation/accounting'
import type { NoteStatus } from '@/generated/prisma/enums'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'

export type NoteActor = Actor

export function buildPersistable(data: NoteData) {
  const priced = data.lines.map((line) => ({ ...line, discountPercent: 0 }))

  const totals = documentTotals({
    lines: priced,
    discountType: 'NONE',
    discountValue: 0,
  })

  const documentSplit = splitGst(totals.taxAmount, data.isInterState)

  const lines = priced.map((line, index) => {
    const computed = lineTotals(line)
    const split = splitGst(computed.taxAmount, data.isInterState)

    return {
      position: index + 1,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      taxRatePercent: line.taxRatePercent,
      amount: computed.amount,
      cgstAmount: split.cgst,
      sgstAmount: split.sgst,
      igstAmount: split.igst,
      lineTotal: computed.lineTotal,
    }
  })

  return {
    totals: {
      subtotal: totals.subtotal,
      taxableAmount: totals.taxableAmount,
      cgstAmount: documentSplit.cgst,
      sgstAmount: documentSplit.sgst,
      igstAmount: documentSplit.igst,
      taxAmount: totals.taxAmount,
      roundOff: totals.roundOff,
      total: totals.total,
    },
    lines,
  }
}

export function partyFields(data: NoteData) {
  const isCustomer = data.partyType === 'CUSTOMER'

  return {
    partyType: data.partyType,
    customerId: isCustomer ? data.customerId : null,
    invoiceId: isCustomer ? data.invoiceId : null,
    vendorName: isCustomer ? null : data.vendorName,
    vendorGstin: isCustomer ? null : data.vendorGstin,
  }
}

export async function createNote(
  actor: NoteActor,
  data: NoteData,
): Promise<{ ok: true; id: string; number: string } | Failure> {
  const { totals, lines } = buildPersistable(data)
  const number = await nextNoteNumber(data.kind)

  const note = await prisma.creditDebitNote.create({
    data: {
      number,
      kind: data.kind,
      status: data.status,
      reason: data.reason,
      noteDate: data.noteDate,
      placeOfSupply: data.placeOfSupply,
      isInterState: data.isInterState,
      reasonNote: data.reasonNote,
      ...partyFields(data),
      ...totals,
      createdById: actor.id,
      updatedById: actor.id,
      lines: { create: lines },
    },
  })

  await logActivity({
    entity: 'note',
    id: note.id,
    action: 'created',
    summary: 'created the note',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, id: note.id, number: note.number }
}

/** A draft note is rewritten; an issued one cannot be edited. */
export async function updateNote(
  actor: NoteActor,
  id: string,
  data: NoteData,
): Promise<{ ok: true; id: string } | Failure> {
  const existing = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    return fail('Note not found', 'NOT_FOUND')
  }

  if (existing.status !== 'DRAFT') {
    return fail('An issued note cannot be edited. Cancel it and raise a new one instead.')
  }

  const { totals, lines } = buildPersistable(data)

  await prisma.$transaction([
    prisma.creditDebitNoteLine.deleteMany({ where: { noteId: id } }),
    prisma.creditDebitNote.update({
      where: { id },
      data: {
        reason: data.reason,
        noteDate: data.noteDate,
        placeOfSupply: data.placeOfSupply,
        isInterState: data.isInterState,
        reasonNote: data.reasonNote,
        ...partyFields(data),
        ...totals,
        updatedById: actor.id,
        lines: { create: lines },
      },
    }),
  ])

  await logActivity({
    entity: 'note',
    id,
    action: 'updated',
    summary: 'edited the note',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, id }
}

export async function setNoteStatus(
  actor: NoteActor,
  id: string,
  status: NoteStatus,
): Promise<{ ok: true; message: string } | Failure> {
  const existing = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { status: true, number: true },
  })

  if (!existing) {
    return fail('Note not found', 'NOT_FOUND')
  }

  if (existing.status === status) {
    return fail(`Already ${status.toLowerCase()}`)
  }

  await prisma.creditDebitNote.update({
    where: { id },
    data: { status, updatedById: actor.id },
  })

  await logActivity({
    entity: 'note',
    id,
    action: 'status',
    summary:
      status === 'ISSUED'
        ? 'issued the note'
        : status === 'CANCELLED'
          ? 'cancelled the note'
          : 'moved the note back to draft',
    actor: { id: actor.id, name: actor.name },
  })

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

export async function deleteNote(id: string): Promise<{ ok: true; message: string } | Failure> {
  const note = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { number: true, status: true },
  })

  if (!note) {
    return fail('Note not found', 'NOT_FOUND')
  }

  if (note.status === 'ISSUED') {
    return fail('Cancel the note before deleting it')
  }

  await prisma.creditDebitNote.delete({ where: { id } })

  return { ok: true, message: `${note.number} removed` }
}
