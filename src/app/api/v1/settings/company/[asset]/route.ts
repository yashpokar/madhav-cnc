import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, reply } from '@/lib/api/handler'
import { readImageUpload } from '@/lib/api/image-upload'
import { companyProfileFor } from '@/lib/api/reads/master'
import { companyAssetParams } from '@/lib/api/schemas/master'
import { must, saved } from '@/lib/api/writes'
import { COMPANY_ASSETS, readCompanyAsset, removeCompanyAsset, setCompanyAsset } from '@/lib/services/company-settings'

const assetOf = (params: Record<string, string>) => parseWith(companyAssetParams, params, 'asset').asset

/** The logo, signature or stamp image, streamed with its own content type (404 when none is set). */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params }) => {
  const asset = assetOf(params)
  const image = await readCompanyAsset(asset)

  if (!image) throw new ApiError('NOT_FOUND', `No ${COMPANY_ASSETS[asset].label} set.`)

  return new Response(new Uint8Array(image.bytes), {
    headers: { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=600' },
  })
})

/** multipart/form-data with `file` (PNG, JPEG or WebP, 10 MB at most). Replaces the image; answers the profile. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', upload: true },
  async ({ request, params, user }) => {
    const asset = assetOf(params)
    const file = await readImageUpload(request, COMPANY_ASSETS[asset].label)

    await setCompanyAsset({ id: user.id, name: user.name }, asset, file)

    return saved(await companyProfileFor())
  },
)

/** Removes the image (404 when none is set). Answers `{ id, deleted }` with the asset name as id. */
export const DELETE = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params, user }) => {
  const asset = assetOf(params)

  must(await removeCompanyAsset({ id: user.id, name: user.name }, asset))

  return reply({ id: asset, deleted: true })
})
