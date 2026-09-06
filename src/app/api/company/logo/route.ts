import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import {
  MAX_UPLOAD_BYTES,
  deleteUpload,
  isAllowedType,
  readUpload,
  saveUpload,
} from '@/lib/storage'

export async function GET() {
  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { logoStoredName: true, logoMimeType: true },
  })

  if (!setting?.logoStoredName) {
    return new NextResponse('No logo set', { status: 404 })
  }

  try {
    const bytes = await readUpload(setting.logoStoredName)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': setting.logoMimeType ?? 'image/png',
        'Cache-Control': 'public, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing from storage', { status: 410 })
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!can(user.role, 'settings:update')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  if (!file.type.startsWith('image/') || !isAllowedType(file.type)) {
    return NextResponse.json(
      { error: 'The logo must be a PNG, JPEG or WebP image' },
      { status: 415 },
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File is larger than the 50 MB limit' },
      { status: 413 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const { storedName } = await saveUpload(bytes, file.type)

  const previous = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { logoStoredName: true },
  })

  await prisma.companySetting.upsert({
    where: { id: 'default' },
    update: {
      logoStoredName: storedName,
      logoMimeType: file.type,
      updatedById: user.id,
    },
    create: {
      id: 'default',
      logoStoredName: storedName,
      logoMimeType: file.type,
      updatedById: user.id,
    },
  })

  if (previous?.logoStoredName) {
    await deleteUpload(previous.logoStoredName)
  }

  return NextResponse.json({ ok: true })
}
