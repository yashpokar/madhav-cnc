import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { readUpload } from '@/lib/storage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return new NextResponse('Not signed in', { status: 401 })
  }

  if (!can(user.role, 'quotation:read')) {
    return new NextResponse('Not permitted', { status: 403 })
  }

  const { id } = await params

  const attachment = await prisma.quotationAttachment.findUnique({
    where: { id },
    select: { storedName: true, mimeType: true, fileName: true },
  })

  if (!attachment) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const bytes = await readUpload(attachment.storedName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('File missing from storage', { status: 410 })
  }
}
