import { apiRoute, parseWith, replyWithEtag } from '@/lib/api/handler'
import { companyProfileFor } from '@/lib/api/reads/master'
import { companyPatchBody } from '@/lib/api/schemas/master'
import { saved } from '@/lib/api/writes'
import { getCompanySetting } from '@/lib/queries/company'
import { saveCompanySetting } from '@/lib/services/company-settings'
import { companySettingSchema } from '@/lib/validation/company'

/** The business profile printed on documents; `hasLogo`, `hasSignature` and `hasStamp` say which images are set. */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ request }) =>
  replyWithEtag(request, await companyProfileFor()),
)

/** Only the fields sent change (null clears an optional one). The industry is fixed once a company exists. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'settings:update', body: companyPatchBody },
  async ({ body, user }) => {
    const row = await getCompanySetting()

    const current = {
      companyName: row.companyName,
      addressLine: row.addressLine,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      gstin: row.gstin,
      pan: row.pan,
      defaultAdvancePercent: row.defaultAdvancePercent.toNumber(),
      invoiceTerms: row.invoiceTerms,
      signatoryName: row.signatoryName,
      signatoryTitle: row.signatoryTitle,
    }

    const data = parseWith(companySettingSchema, { ...current, ...body }, 'business profile')

    await saveCompanySetting({ id: user.id, name: user.name }, data)

    return saved(await companyProfileFor())
  },
)
