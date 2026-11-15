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

/**
 * The signature and stamp printed on invoices. Unlike the logo these are not
 * public: only signed-in users can read them, and only settings editors can
 * change them. (/api/company/logo and /qr have their own routes.)
 */
const ASSETS = {
  signature: { stored: 'signatureStoredName', mime: 'signatureMimeType', label: 'signature' },
  stamp: { stored: 'stampStoredName', mime: 'stampMimeType', label: 'stamp' },
} as const

type AssetKey = keyof typeof ASSETS

function pick(asset: string) {
  return asset in ASSETS ? ASSETS[asset as AssetKey] : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const spec = pick((await params).asset)
  const user = await getCurrentUser()

  if (!spec) return new NextResponse('Not found', { status: 404 })
  if (!user || !user.isActive) return new NextResponse('Not signed in', { status: 401 })

  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { [spec.stored]: true, [spec.mime]: true },
  })
  const stored = setting?.[spec.stored]

  if (!stored) return new NextResponse(`No ${spec.label} set`, { status: 404 })

  try {
    const bytes = await readUpload(stored)

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': setting?.[spec.mime] ?? 'image/png',
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return new NextResponse('File missing from storage', { status: 410 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const spec = pick((await params).asset)
  const user = await getCurrentUser()

  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!user || !user.isActive) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!can(user.role, 'settings:update')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const file = (await request.formData()).get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  if (!file.type.startsWith('image/') || !isAllowedType(file.type)) {
    return NextResponse.json(
      { error: `The ${spec.label} must be a PNG, JPEG or WebP image` },
      { status: 415 },
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is larger than the 50 MB limit' }, { status: 413 })
  }

  const { storedName } = await saveUpload(Buffer.from(await file.arrayBuffer()), file.type)

  const previous = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { [spec.stored]: true },
  })

  await prisma.companySetting.upsert({
    where: { id: 'default' },
    update: { [spec.stored]: storedName, [spec.mime]: file.type, updatedById: user.id },
    create: { id: 'default', [spec.stored]: storedName, [spec.mime]: file.type, updatedById: user.id },
  })

  const old = previous?.[spec.stored]

  if (old) await deleteUpload(old)

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const spec = pick((await params).asset)
  const user = await getCurrentUser()

  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!user || !user.isActive) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!can(user.role, 'settings:update')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { [spec.stored]: true },
  })
  const stored = setting?.[spec.stored]

  if (!stored) return NextResponse.json({ error: `No ${spec.label} to remove` }, { status: 404 })

  await deleteUpload(stored)
  await prisma.companySetting.update({
    where: { id: 'default' },
    data: { [spec.stored]: null, [spec.mime]: null, updatedById: user.id },
  })

  return NextResponse.json({ ok: true })
}
