import { ImageResponse } from 'next/og'
import { MARK_PATH, MARK_STROKE_WIDTH, MARK_VIEWBOX } from '@/lib/brand'

const SIZES = new Set([180, 192, 512])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params
  const size = Number(raw)

  if (!SIZES.has(size)) {
    return new Response('Not found', { status: 404 })
  }

  // Maskable icons keep the mark inside the central safe zone.
  const maskable = new URL(request.url).searchParams.has('maskable')
  const mark = Math.round(size * (maskable ? 0.5 : 0.72))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#4f46e5',
        }}
      >
        <svg width={mark} height={mark} viewBox={MARK_VIEWBOX} fill="none">
          <path
            d={MARK_PATH}
            stroke="#fff"
            strokeWidth={MARK_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  )
}
