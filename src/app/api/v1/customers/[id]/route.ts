import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, replyWithEtag } from '@/lib/api/handler'
import { customerDetailFor } from '@/lib/api/reads/detail'
import { customerPatchBody } from '@/lib/api/schemas/writes'
import { actorOf, must, saved } from '@/lib/api/writes'
import { dayOrNull } from '@/lib/api/reads/format'
import { customerInputSchema } from '@/lib/validation/customers'
import { updateCustomer } from '@/lib/services/customers'
import { customerDetailOut } from '@/lib/api/reads/mappers'
import { can } from '@/lib/permissions'
import { customerAccount } from '@/lib/queries/payments'
import { getCustomer } from '@/lib/queries/customers'

export const GET = apiRoute({ auth: 'company', capability: 'customer:read' }, async ({ request, params, user }) => {
  const row = await getCustomer(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Customer not found.')
  // The balance needs the money role; a person who may only read customers gets none.
  const account = can(user.role, 'invoice:read') ? await customerAccount(row.id) : null

  return replyWithEtag(request, customerDetailOut(row, account))
})

/** Only the fields sent change; a field sent as null (or "") is cleared. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'customer:update', body: customerPatchBody },
  async ({ params, body, user }) => {
    const row = await getCustomer(params.id)

    if (!row) throw new ApiError('NOT_FOUND', 'Customer not found.')

    const current = {
      name: row.name,
      type: row.type,
      status: row.status,
      phone: row.phone,
      altPhone: row.altPhone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      gstin: row.gstin,
      pan: row.pan,
      dateOfBirth: dayOrNull(row.dateOfBirth),
      anniversaryDate: dayOrNull(row.anniversaryDate),
      preferredArchitectId: row.preferredArchitectId,
      preferredCarpenterId: row.preferredCarpenterId,
      paymentTermsDays: row.paymentTermsDays,
      notes: row.notes,
      openingDue: row.openingDue.toNumber(),
      openingAsOf: dayOrNull(row.openingAsOf),
    }

    const data = parseWith(customerInputSchema, { ...current, ...body }, 'customer')

    must(await updateCustomer(actorOf(user), params.id, data))

    return saved(await customerDetailFor(user, params.id))
  },
)
