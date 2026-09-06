import { NextResponse } from 'next/server'
import {
  attachmentBelongsToQuotation,
  findShareByToken,
  shareIsUsable,
} from '@/lib/queries/share'
import { readUpload } from '@/lib/storage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; attachmentId: string }> },
) {
  const { token, attachmentId } = await params

  const share = await findShareByToken(token)

  if (!share || !shareIsUsable(share)) {
    return new NextResponse('Not available', { status: 404 })
  }

  const attachment = await attachmentBelongsToQuotation(
    attachmentId,
    share.quotationId,
  )

  if (!attachment) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const bytes = await readUpload(attachment.storedName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing', { status: 410 })
  }
}
