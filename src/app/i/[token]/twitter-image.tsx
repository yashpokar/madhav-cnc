import { SOCIAL_SIZE, renderSharedDocumentCard } from '@/lib/brand-image'

export const alt = 'Invoice'
export const size = SOCIAL_SIZE
export const contentType = 'image/png'

export default function TwitterImage() {
  return renderSharedDocumentCard('Invoice')
}
