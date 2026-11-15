import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { assertNoteRefs } from '@/lib/api/master'
import { noteDetailFor, noteListOut } from '@/lib/api/reads/master'
import { notesQuery, noteWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listNotes } from '@/lib/queries/accounting'
import { createNote } from '@/lib/services/notes'

/** Credit and debit notes, newest first. */
export const GET = apiRoute({ auth: 'company', capability: 'note:read', query: notesQuery }, async ({ query }) => {
  const { args, limit } = pageArgs(query)
  const rows = await listNotes({ search: query.q, kind: query.kind, status: query.status, page: args })
  const { items, meta } = paged(rows, limit, (row) => at(row.noteDate, row.id))

  return reply(items.map(noteListOut), { meta })
})

/**
 * Raises a credit or debit note (a draft unless `status` says ISSUED). A
 * CUSTOMER note names a customer (and optionally an invoice); a VENDOR note a
 * vendor name. Lines are priced with the web's GST rules; totals come back.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'note:create', body: noteWriteBody, idempotent: true },
  async ({ body, user }) => {
    await assertNoteRefs(body)

    const created = must(await createNote(actorOf(user), body))

    return saved(await noteDetailFor(created.id), 201)
  },
)
