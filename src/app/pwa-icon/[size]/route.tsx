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
          background: '#4f46e5',
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32" fill="none">
          <path
            d="M12 24.5V8.5h4.6a5.2 5.2 0 0 1 0 10.4H12"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  )
}
