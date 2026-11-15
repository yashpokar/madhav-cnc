import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, reply, replyWithEtag } from '@/lib/api/handler'
import { partnerDetailFor, partnerDetailOut } from '@/lib/api/reads/master'
import { partnerPatchBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { getPartner } from '@/lib/queries/partners'
import { deletePartner, updatePartner } from '@/lib/services/partners'
import { partnerInputSchema } from '@/lib/validation/partners'

export const GET = apiRoute({ auth: 'company', capability: 'partner:read' }, async ({ request, params }) => {
  const row = await getPartner(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Partner not found.')

  return replyWithEtag(request, partnerDetailOut(row))
})

/** Only the fields sent change. A partner's type is fixed once created. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'partner:update', body: partnerPatchBody },
  async ({ params, body, user }) => {
    const row = await getPartner(params.id)

    if (!row) throw new ApiError('NOT_FOUND', 'Partner not found.')

    const current = {
      type: row.type,
      name: row.name,
      firmName: row.firmName,
      phone: row.phone,
      altPhone: row.altPhone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      isActive: row.isActive,
      notes: row.notes,
    }

    const data = parseWith(partnerInputSchema, { ...current, ...body }, 'partner')

    must(await updatePartner(actorOf(user), params.id, data))

    return saved(await partnerDetailFor(params.id))
  },
)

/** Refused with 409 while customers, quotations or orders point at the partner: mark it inactive instead. */
export const DELETE = apiRoute({ auth: 'company', capability: 'partner:delete' }, async ({ params }) => {
  must(await deletePartner(params.id))

  return reply({ id: params.id, deleted: true })
})
