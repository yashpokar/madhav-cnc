import { renderIcon } from '@/lib/brand-image'

export const dynamic = 'force-static'

/**
 * Legacy /favicon.ico for browsers and crawlers that ignore <link rel="icon">.
 * An ICO file can wrap PNG images directly, so we pack the 16 and 32 px
 * renders into one container instead of adding an image dependency.
 */
export async function GET() {
  const sizes = [16, 32]
  const images = await Promise.all(
    sizes.map(async (px) => Buffer.from(await renderIcon(px).arrayBuffer())),
  )

  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = header.length + 16 * images.length
  const entries = images.map((png, index) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(sizes[index], 0) // width
    entry.writeUInt8(sizes[index], 1) // height
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return new Response(
    new Uint8Array(Buffer.concat([header, ...entries, ...images])),
    {
      headers: {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  )
}
