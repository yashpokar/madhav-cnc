import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { MAX_UPLOAD_BYTES, deleteUpload, isAllowedType, readUpload, saveUpload } from '@/lib/storage'

type Params = { params: Promise<{ id: string }> }

async function editor() {
  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }

  if (!can(user.role, 'settings:update')) {
    return { error: NextResponse.json({ error: 'Not permitted' }, { status: 403 }) }
  }

  return { user }
}

/** The QR code of one of the active company's payment modes. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser()

  if (!user || !user.isActive) return new NextResponse('Not signed in', { status: 401 })

  const channel = await prisma.paymentChannel.findUnique({
    where: { id: (await params).id },
    select: { qrStoredName: true, qrMimeType: true },
  })

  if (!channel?.qrStoredName) return new NextResponse('No QR code', { status: 404 })

  try {
    const bytes = await readUpload(channel.qrStoredName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': channel.qrMimeType ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing from storage', { status: 410 })
  }
}

export async function POST(request: Request, { params }: Params) {
  const check = await editor()

  if (check.error) return check.error

  const id = (await params).id
  const file = (await request.formData()).get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  if (!file.type.startsWith('image/') || !isAllowedType(file.type)) {
    return NextResponse.json({ error: 'The QR code must be a PNG, JPEG or WebP image' }, { status: 415 })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is larger than the 50 MB limit' }, { status: 413 })
  }

  const channel = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { qrStoredName: true },
  })

  if (!channel) return NextResponse.json({ error: 'Payment mode not found' }, { status: 404 })

  const { storedName } = await saveUpload(Buffer.from(await file.arrayBuffer()), file.type)

  await prisma.paymentChannel.update({
    where: { id },
    data: { qrStoredName: storedName, qrMimeType: file.type },
  })

  if (channel.qrStoredName) await deleteUpload(channel.qrStoredName)

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const check = await editor()

  if (check.error) return check.error

  const id = (await params).id
  const channel = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { qrStoredName: true },
  })

  if (!channel?.qrStoredName) {
    return NextResponse.json({ error: 'No QR code to remove' }, { status: 404 })
  }

  await deleteUpload(channel.qrStoredName)
  await prisma.paymentChannel.update({ where: { id }, data: { qrStoredName: null, qrMimeType: null } })

  return NextResponse.json({ ok: true })
}
