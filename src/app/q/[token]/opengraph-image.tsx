import { SOCIAL_SIZE, renderSharedDocumentCard } from '@/lib/brand-image'

export const alt = 'Quotation'
export const size = SOCIAL_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return renderSharedDocumentCard('Quotation')
}
