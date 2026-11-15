// The QR code image of a payment mode, as plain functions (the web's
// /api/payment-modes/[id]/qr route keeps its own copy). Runs inside a company
// scope, so another company's mode is "not found". The caller checks the
// capability (settings:update to change it).

import { prisma } from '@/lib/prisma'
import { deleteUpload, readUpload, saveUpload } from '@/lib/storage'
import { fail, type Failure } from '@/lib/services/people-shared'

export async function setPaymentModeQr(
  id: string,
  file: { bytes: Buffer; mime: string },
): Promise<{ ok: true } | Failure> {
  const channel = await prisma.paymentChannel.findUnique({ where: { id }, select: { qrStoredName: true } })

  if (!channel) return fail('Payment mode not found', 'NOT_FOUND')

  const { storedName } = await saveUpload(file.bytes, file.mime)

  await prisma.paymentChannel.update({ where: { id }, data: { qrStoredName: storedName, qrMimeType: file.mime } })

  if (channel.qrStoredName) await deleteUpload(channel.qrStoredName)

  return { ok: true }
}

export async function removePaymentModeQr(id: string): Promise<{ ok: true } | Failure> {
  const channel = await prisma.paymentChannel.findUnique({ where: { id }, select: { qrStoredName: true } })

  if (!channel?.qrStoredName) return fail('No QR code to remove', 'NOT_FOUND')

  await deleteUpload(channel.qrStoredName)
  await prisma.paymentChannel.update({ where: { id }, data: { qrStoredName: null, qrMimeType: null } })

  return { ok: true }
}

/** The image's bytes and type, or null when none is set or the file is gone from storage. */
export async function readPaymentModeQr(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const channel = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { qrStoredName: true, qrMimeType: true },
  })

  if (!channel?.qrStoredName) return null

  try {
    return { bytes: await readUpload(channel.qrStoredName), mime: channel.qrMimeType ?? 'image/png' }
  } catch {
    return null
  }
}
