import { ApiError } from '@/lib/api/errors'
import { requireApiCapability } from '@/lib/api/auth'
import { apiRoute } from '@/lib/api/handler'
import { PURPOSE_CAPABILITY, type UploadPurpose } from '@/lib/api/uploads'
import { prisma } from '@/lib/prisma'
import { extensionFor, readUpload } from '@/lib/storage'

/**
 * Streams the file with its own content type. Only people of the company the
 * file was uploaded in can open it (another company's id is 404), and the role
 * must be allowed to read what the file is for (or be the person who uploaded it).
 */
export const GET = apiRoute({ auth: 'company' }, async ({ params, user }) => {
  const row = await prisma.upload.findUnique({
    where: { id: params.id },
    select: { storedName: true, mime: true, size: true, purpose: true, userId: true },
  })

  if (!row) throw new ApiError('NOT_FOUND', 'File not found.')

  const rule = PURPOSE_CAPABILITY[row.purpose as UploadPurpose]

  if (row.userId !== user.id && rule) requireApiCapability(user, rule.read)

  let bytes: Buffer

  try {
    bytes = await readUpload(row.storedName)
  } catch {
    throw new ApiError('NOT_FOUND', 'The file is missing from storage.')
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="upload${extensionFor(row.mime)}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
