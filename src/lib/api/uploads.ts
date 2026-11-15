import type { Action, Resource } from '@/lib/permissions'

export const API_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type UploadPurpose = 'expense_receipt' | 'payment_proof' | 'quotation_attachment'

/** What a person needs to be allowed to upload (write) or open (read) a file of this purpose. */
export const PURPOSE_CAPABILITY: Record<UploadPurpose, { write: `${Resource}:${Action}`; read: `${Resource}:${Action}` }> = {
  expense_receipt: { write: 'expense:create', read: 'expense:read' },
  payment_proof: { write: 'payment:create', read: 'payment:read' },
  quotation_attachment: { write: 'quotation:update', read: 'quotation:read' },
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value)

/**
 * The first bytes must look like the type the phone declared, so a renamed
 * executable or HTML page is not stored as a "photo". HEIC/HEIF have no
 * single signature worth checking here and are accepted on their declared type.
 */
export function looksLike(mime: string, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'image/gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38])
    case 'image/webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
    case 'application/pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46])
    default:
      return true
  }
}
