import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findShareableInvoiceCompany } from '@/lib/queries/invoice-share'
import { readUpload } from '@/lib/storage'

/**
 * The company's signature and stamp for a shared invoice. They are printed on
 * every invoice the customer receives, so anyone holding that invoice's link may
 * see them; nothing else about the company is reachable from here.
 */
const ASSETS = {
  signature: { stored: 'signatureStoredName', mime: 'signatureMimeType' },
  stamp: { stored: 'stampStoredName', mime: 'stampMimeType' },
} as const

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; name: string }> },
) {
  const { token, name } = await params
  const spec = name === 'signature' || name === 'stamp' ? ASSETS[name] : null

  if (!spec) {
    return new NextResponse('Not found', { status: 404 })
  }

  const companyId = await findShareableInvoiceCompany(token)

  if (!companyId) {
    return new NextResponse('Not available', { status: 404 })
  }

  const setting = await prisma.companySetting.findUnique({
    where: { id: companyId },
    select: {
      signatureStoredName: true,
      signatureMimeType: true,
      stampStoredName: true,
      stampMimeType: true,
    },
  })

  const stored = setting?.[spec.stored]

  if (!stored) {
    return new NextResponse('Not set', { status: 404 })
  }

  try {
    const bytes = await readUpload(stored)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': setting?.[spec.mime] ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing', { status: 410 })
  }
}
