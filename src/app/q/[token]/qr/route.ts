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
    select: { upiQrStoredName: true, upiQrMimeType: true },
  })

  if (!setting?.upiQrStoredName) {
    return new NextResponse('No QR code', { status: 404 })
  }

  try {
    const bytes = await readUpload(setting.upiQrStoredName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': setting.upiQrMimeType ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing', { status: 410 })
  }
}
