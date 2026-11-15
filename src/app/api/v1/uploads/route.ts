import { ApiError } from '@/lib/api/errors'
import { requireApiCapability } from '@/lib/api/auth'
import { apiRoute, parseWith } from '@/lib/api/handler'
import { saved } from '@/lib/api/writes'
import { API_MAX_UPLOAD_BYTES, PURPOSE_CAPABILITY, looksLike, type UploadPurpose } from '@/lib/api/uploads'
import { UPLOAD_PURPOSES } from '@/lib/api/schemas/writes'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ALLOWED_MIME_TYPES, isAllowedType, isStorageConfigured, saveUpload } from '@/lib/storage'

/**
 * multipart/form-data: `file` and `purpose`. The capability depends on the
 * purpose (expense_receipt: expense:create, payment_proof: payment:create,
 * quotation_attachment: quotation:update). The file is stored, an Upload row
 * of this company is made, and its id is what an expense (receiptUploadId)
 * refers to. Counts against the stricter upload rate limit.
 */
export const POST = apiRoute({ auth: 'company', upload: true }, async ({ request, user, companyId }) => {
  const declared = Number(request.headers.get('content-length') ?? 0)

  // The body adds a little to the file; refuse an obviously oversized request before reading it.
  if (declared > API_MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new ApiError('VALIDATION_FAILED', 'The file is too large (10 MB at most).', {
      fields: { file: 'At most 10 MB' },
    })
  }

  let form: FormData

  try {
    form = await request.formData()
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Send multipart/form-data with a file and a purpose.', {
      fields: { file: 'Required' },
    })
  }

  const { purpose } = parseWith(z.object({ purpose: z.enum(UPLOAD_PURPOSES) }), { purpose: form.get('purpose') }, 'upload')

  requireApiCapability(user, PURPOSE_CAPABILITY[purpose].write)

  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError('VALIDATION_FAILED', 'Choose a file to upload.', { fields: { file: 'Required' } })
  }

  if (file.size > API_MAX_UPLOAD_BYTES) {
    throw new ApiError('VALIDATION_FAILED', 'The file is too large (10 MB at most).', {
      fields: { file: 'At most 10 MB' },
    })
  }

  if (!isAllowedType(file.type)) {
    throw new ApiError('VALIDATION_FAILED', `Upload ${ALLOWED_MIME_TYPES.map((t) => t.split('/')[1]).join(', ')} files only.`, {
      fields: { file: 'This file type is not allowed' },
    })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  if (!looksLike(file.type, bytes)) {
    throw new ApiError('VALIDATION_FAILED', 'The file is not what its type says it is.', {
      fields: { file: 'Not a valid file' },
    })
  }

  if (!isStorageConfigured()) {
    throw new ApiError('INTERNAL', 'File uploads are not available right now.')
  }

  const stored = await saveUpload(bytes, file.type)

  const row = await prisma.upload.create({
    data: {
      companyId,
      userId: user.id,
      storedName: stored.storedName,
      mime: file.type,
      size: bytes.byteLength,
      purpose,
    },
    select: { id: true, mime: true, size: true, purpose: true },
  })

  return saved(
    {
      uploadId: row.id,
      url: `/api/v1/uploads/${row.id}`,
      mime: row.mime,
      size: row.size,
      purpose: row.purpose as UploadPurpose,
    },
    201,
  )
})
