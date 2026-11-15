import { ApiError } from '@/lib/api/errors'
import { API_MAX_UPLOAD_BYTES, looksLike } from '@/lib/api/uploads'
import { isStorageConfigured } from '@/lib/storage'

/** The images a business profile asset (logo, signature, stamp, payment QR) may be: what the web accepts. */
export const ASSET_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/**
 * Reads the single `file` of a multipart request for a profile image: size,
 * type and first bytes are checked (422 with `fields.file`), and storage must
 * be configured. The caller has already checked the capability.
 */
export async function readImageUpload(request: Request, label: string): Promise<{ bytes: Buffer; mime: string }> {
  const declared = Number(request.headers.get('content-length') ?? 0)

  if (declared > API_MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new ApiError('VALIDATION_FAILED', 'The file is too large (10 MB at most).', { fields: { file: 'At most 10 MB' } })
  }

  let form: FormData

  try {
    form = await request.formData()
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Send multipart/form-data with a file.', { fields: { file: 'Required' } })
  }

  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError('VALIDATION_FAILED', 'Choose a file to upload.', { fields: { file: 'Required' } })
  }

  if (file.size > API_MAX_UPLOAD_BYTES) {
    throw new ApiError('VALIDATION_FAILED', 'The file is too large (10 MB at most).', { fields: { file: 'At most 10 MB' } })
  }

  if (!(ASSET_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ApiError('VALIDATION_FAILED', `The ${label} must be a PNG, JPEG or WebP image.`, {
      fields: { file: 'Not an allowed image type' },
    })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  if (!looksLike(file.type, bytes)) {
    throw new ApiError('VALIDATION_FAILED', 'The file is not what its type says it is.', { fields: { file: 'Not a valid file' } })
  }

  if (!isStorageConfigured()) {
    throw new ApiError('INTERNAL', 'File uploads are not available right now.')
  }

  return { bytes, mime: file.type }
}
