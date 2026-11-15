import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findShareableInvoiceCompany } from '@/lib/queries/invoice-share'
import { readUpload } from '@/lib/storage'

/** A payment mode's QR code, for a customer looking at a shared invoice. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; mode: string }> },
) {
  const { token, mode } = await params
  const companyId = await findShareableInvoiceCompany(token)

  if (!companyId) {
    return new NextResponse('Not available', { status: 404 })
  }

  // Only modes the company has chosen to show on its documents.
  const channel = await prisma.paymentChannel.findFirst({
    where: { id: mode, companyId, isActive: true, showOnDocuments: true },
    select: { qrStoredName: true, qrMimeType: true },
  })

  if (!channel?.qrStoredName) {
    return new NextResponse('No QR code', { status: 404 })
  }

  try {
    const bytes = await readUpload(channel.qrStoredName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': channel.qrMimeType ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing', { status: 410 })
  }
}
