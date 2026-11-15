import { SOCIAL_SIZE, renderSharedDocumentCard } from '@/lib/brand-image'

export const alt = 'Order status'
export const size = SOCIAL_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return renderSharedDocumentCard('Order status')
}
