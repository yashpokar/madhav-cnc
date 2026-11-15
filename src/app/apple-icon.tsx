import { renderIcon } from '@/lib/brand-image'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS rounds the corners itself, so the tile bleeds to the edge.
export default function AppleIcon() {
  return renderIcon(180, { bleed: true })
}
