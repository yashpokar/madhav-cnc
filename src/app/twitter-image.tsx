import { BRAND } from '@/lib/brand'
import { SOCIAL_SIZE, renderBrandCard } from '@/lib/brand-image'

export const alt = `${BRAND.name}: ${BRAND.tagline}`
export const size = SOCIAL_SIZE
export const contentType = 'image/png'

export default function TwitterImage() {
  return renderBrandCard()
}
