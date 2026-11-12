import { ImageResponse } from 'next/og'

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
          background: '#18181b',
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32" fill="none">
          <path
            d="M8.5 22V10.5l4.2 6.2 4.2-6.2V22"
            stroke="#fff"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="22.5" cy="19.5" r="2.6" stroke="#fff" strokeWidth="2.1" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  )
}
