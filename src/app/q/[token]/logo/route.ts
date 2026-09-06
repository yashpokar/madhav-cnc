import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findShareByToken, shareIsUsable } from '@/lib/queries/share'
import { readUpload } from '@/lib/storage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const share = await findShareByToken(token)

  if (!share || !shareIsUsable(share)) {
    return new NextResponse('Not available', { status: 404 })
  }

  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { logoStoredName: true, logoMimeType: true },
  })

  if (!setting?.logoStoredName) {
    return new NextResponse('No logo', { status: 404 })
  }

  try {
    const bytes = await readUpload(setting.logoStoredName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': setting.logoMimeType ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing', { status: 410 })
  }
}
