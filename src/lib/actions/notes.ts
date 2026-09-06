'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextNoteNumber } from '@/lib/codes'
import { documentTotals, lineTotals, splitGst } from '@/lib/pricing'
import { noteInputSchema } from '@/lib/validation/accounting'
import type { NoteData } from '@/lib/validation/accounting'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { NoteStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return noteInputSchema.safeParse({
    kind: formData.get('kind'),
    status: formData.get('status') ?? undefined,
    partyType: formData.get('partyType'),
    reason: formData.get('reason') ?? undefined,
    customerId: formData.get('customerId'),
    vendorName: formData.get('vendorName'),
    vendorGstin: formData.get('vendorGstin'),
    invoiceId: formData.get('invoiceId'),
    noteDate: formData.get('noteDate'),
    placeOfSupply: formData.get('placeOfSupply'),
    isInterState: formData.get('isInterState') === 'true',
    reasonNote: formData.get('reasonNote'),
    lines,
  })
}

function buildPersistable(data: NoteData) {
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

function partyFields(data: NoteData) {
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
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('note:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const { totals, lines } = buildPersistable(parsed.data)
  const number = await nextNoteNumber(parsed.data.kind)

  const note = await prisma.creditDebitNote.create({
    data: {
      number,
      kind: parsed.data.kind,
      status: parsed.data.status,
      reason: parsed.data.reason,
      noteDate: parsed.data.noteDate,
      placeOfSupply: parsed.data.placeOfSupply,
      isInterState: parsed.data.isInterState,
      reasonNote: parsed.data.reasonNote,
      ...partyFields(parsed.data),
      ...totals,
      createdById: user.id,
      updatedById: user.id,
      lines: { create: lines },
    },
  })

  revalidatePath('/notes')
  redirect(`/notes/${note.id}?created=1`)
}

export async function updateNote(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('note:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    return { status: 'error', message: 'Note not found' }
  }

  if (existing.status !== 'DRAFT') {
    return {
      status: 'error',
      message:
        'An issued note cannot be edited. Cancel it and raise a new one instead.',
    }
  }

  const { totals, lines } = buildPersistable(parsed.data)

  await prisma.$transaction([
    prisma.creditDebitNoteLine.deleteMany({ where: { noteId: id } }),
    prisma.creditDebitNote.update({
      where: { id },
      data: {
        reason: parsed.data.reason,
        noteDate: parsed.data.noteDate,
        placeOfSupply: parsed.data.placeOfSupply,
        isInterState: parsed.data.isInterState,
        reasonNote: parsed.data.reasonNote,
        ...partyFields(parsed.data),
        ...totals,
        updatedById: user.id,
        lines: { create: lines },
      },
    }),
  ])

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)

  return { status: 'success', message: 'Note saved', id }
}

export async function setNoteStatus(
  id: string,
  status: NoteStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('note:update')

  const existing = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { status: true, number: true },
  })

  if (!existing) {
    return { ok: false, error: 'Note not found' }
  }

  if (existing.status === status) {
    return { ok: false, error: `Already ${status.toLowerCase()}` }
  }

  await prisma.creditDebitNote.update({
    where: { id },
    data: { status, updatedById: user.id },
  })

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

export async function deleteNote(id: string): Promise<SimpleResult> {
  await requireCapability('note:delete')

  const note = await prisma.creditDebitNote.findUnique({
    where: { id },
    select: { number: true, status: true },
  })

  if (!note) {
    return { ok: false, error: 'Note not found' }
  }

  if (note.status === 'ISSUED') {
    return {
      ok: false,
      error: 'Cancel the note before deleting it',
    }
  }

  await prisma.creditDebitNote.delete({ where: { id } })

  revalidatePath('/notes')

  return { ok: true, message: `${note.number} removed` }
}
