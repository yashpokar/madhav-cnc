import { ImageResponse } from 'next/og'
import {
  BRAND,
  MARK_PATH,
  MARK_STROKE_WIDTH,
  MARK_TILE_RADIUS,
  MARK_VIEWBOX,
} from '@/lib/brand'

/** The mark as an inline SVG that Satori (next/og) can render. */
function Mark({
  size,
  tile,
  stroke,
  rounded = true,
}: {
  size: number
  tile: string
  stroke: string
  rounded?: boolean
}) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} fill="none">
      <rect
        width="32"
        height="32"
        rx={rounded ? MARK_TILE_RADIUS : 0}
        fill={tile}
      />
      <path
        d={MARK_PATH}
        stroke={stroke}
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Square app icon: the mark tile, optionally full-bleed (apple-touch). */
export function renderIcon(size: number, { bleed = false } = {}) {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Mark size={size} tile={BRAND.accent} stroke="#fff" rounded={!bleed} />
    </div>,
    { width: size, height: size },
  )
}

export const SOCIAL_SIZE = { width: 1200, height: 630 }

/** The Prodlys link-preview card: mark, wordmark and tagline on the gradient. */
export function renderBrandCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: '#fff',
          background: `linear-gradient(135deg, ${BRAND.accent} 0%, ${BRAND.accentDeep} 100%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Mark size={96} tile="#fff" stroke={BRAND.accent} />
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: '-0.03em',
            }}
          >
            {BRAND.wordmark}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              maxWidth: 940,
            }}
          >
            {BRAND.tagline}
          </div>
          <div style={{ fontSize: 34, color: '#c7d2fe' }}>
            Quotes, orders, production and billing.
          </div>
        </div>
      </div>
    ),
    SOCIAL_SIZE,
  )
}

/**
 * Neutral card for customer-facing share links. Carries no Prodlys branding,
 * company data or amounts, so a WhatsApp preview stays tidy and private.
 */
export function renderSharedDocumentCard(kind: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f6f7f9',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 48,
            padding: '56px 72px',
            background: '#fff',
            borderRadius: 32,
            border: '2px solid #e4e7ee',
          }}
        >
          <svg width="150" height="190" viewBox="0 0 30 38" fill="none">
            <path
              d="M3 3h16l8 8v24H3z"
              fill="#eef2ff"
              stroke="#4f46e5"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M19 3v8h8"
              stroke="#4f46e5"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8 18h14M8 23h14M8 28h8"
              stroke="#4f46e5"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                fontSize: 84,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#0b0f17',
              }}
            >
              {kind}
            </div>
            <div style={{ fontSize: 36, color: '#475266' }}>
              Shared with you. Open the link to view it.
            </div>
          </div>
        </div>
      </div>
    ),
    SOCIAL_SIZE,
  )
}
