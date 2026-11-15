'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { withAuditNote } from '@/lib/audit-trail/context'
import { requireCapability } from '@/lib/session'
import { noteInputSchema } from '@/lib/validation/accounting'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import type { NoteStatus } from '@/generated/prisma/enums'
import * as notes from '@/lib/services/notes'

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

  const result = await notes.createNote(user, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/notes')
  redirect(`/notes/${result.id}?created=1`)
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

  const result = await notes.updateNote(user, id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)

  return { status: 'success', message: 'Note saved', id }
}

export async function setNoteStatus(
  id: string,
  status: NoteStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('note:update')
  const result = await notes.setNoteStatus(user, id, status)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)

  return { ok: true, message: result.message }
}

export async function deleteNote(id: string, reason?: string): Promise<SimpleResult> {
  await requireCapability('note:delete')

  const result = await withAuditNote({ reason }, () => notes.deleteNote(id))

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/notes')

  return { ok: true, message: result.message }
}
