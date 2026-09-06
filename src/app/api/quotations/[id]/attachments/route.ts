import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { invalidateApproval } from '@/lib/reapproval'
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedType,
  saveUpload,
} from '@/lib/storage'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!can(user.role, 'quotation:update')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const { id } = await params

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!quotation) {
    return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  }

  if (quotation.status === 'CONVERTED') {
    return NextResponse.json(
      { error: 'This quotation is confirmed as an order and cannot be changed' },
      { status: 409 },
    )
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const comment = formData.get('comment')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  if (!isAllowedType(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      },
      { status: 415 },
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File is larger than the 50 MB limit' },
      { status: 413 },
    )
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File is larger than the 50 MB limit' },
      { status: 413 },
    )
  }

  const { storedName } = await saveUpload(bytes, file.type)

  const attachment = await prisma.quotationAttachment.create({
    data: {
      quotationId: quotation.id,
      fileName: file.name || 'pasted-image',
      storedName,
      mimeType: file.type,
      sizeBytes: bytes.byteLength,
      comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
      uploadedById: user.id,
    },
    select: { id: true, fileName: true },
  })

  const wasApproved = await invalidateApproval(
    quotation.id,
    'Design reference added',
  )

  return NextResponse.json({ ok: true, attachment, approvalCleared: wasApproved })
}
