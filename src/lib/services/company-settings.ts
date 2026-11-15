// The business profile (company settings) as plain functions: the text fields
// the web form saves, and the logo, signature and stamp images. Runs inside a
// company scope (web: active-company cookie; API: X-Company-Id): the settings
// row id IS the company id, taken from that scope. The caller checks
// settings:update.

import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { deleteUpload, readUpload, saveUpload } from '@/lib/storage'
import type { CompanySettingData } from '@/lib/validation/company'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'

export const COMPANY_ASSETS = {
  logo: { stored: 'logoStoredName', mime: 'logoMimeType', label: 'logo' },
  signature: { stored: 'signatureStoredName', mime: 'signatureMimeType', label: 'signature' },
  stamp: { stored: 'stampStoredName', mime: 'stampMimeType', label: 'stamp' },
} as const

export type CompanyAsset = keyof typeof COMPANY_ASSETS

export function isCompanyAsset(value: string): value is CompanyAsset {
  return value in COMPANY_ASSETS
}

/** Saves the profile fields (creating the settings row the first time). */
export async function saveCompanySetting(actor: Actor, data: CompanySettingData): Promise<{ ok: true }> {
  const id = await requireCompanyId()

  await prisma.companySetting.upsert({
    where: { id },
    update: { ...data, updatedById: actor.id },
    create: { id, ...data, updatedById: actor.id },
  })

  return { ok: true }
}

type AssetRow = Record<string, string | null> | null

/** Replaces the logo, signature or stamp; the previous file is removed from storage. */
export async function setCompanyAsset(
  actor: Actor,
  asset: CompanyAsset,
  file: { bytes: Buffer; mime: string },
): Promise<{ ok: true }> {
  const spec = COMPANY_ASSETS[asset]
  const id = await requireCompanyId()
  const previous = (await prisma.companySetting.findUnique({ where: { id } })) as AssetRow

  const { storedName } = await saveUpload(file.bytes, file.mime)

  await prisma.companySetting.upsert({
    where: { id },
    update: { [spec.stored]: storedName, [spec.mime]: file.mime, updatedById: actor.id },
    create: { id, [spec.stored]: storedName, [spec.mime]: file.mime, updatedById: actor.id },
  })

  const old = previous?.[spec.stored]

  if (old) await deleteUpload(old)

  return { ok: true }
}

export async function removeCompanyAsset(actor: Actor, asset: CompanyAsset): Promise<{ ok: true } | Failure> {
  const spec = COMPANY_ASSETS[asset]
  const id = await requireCompanyId()
  const setting = (await prisma.companySetting.findUnique({ where: { id } })) as AssetRow
  const stored = setting?.[spec.stored]

  if (!stored) return fail(`No ${spec.label} to remove`, 'NOT_FOUND')

  await deleteUpload(stored)
  await prisma.companySetting.update({
    where: { id },
    data: { [spec.stored]: null, [spec.mime]: null, updatedById: actor.id },
  })

  return { ok: true }
}

/** The image's bytes and type, or null when none is set or the file is gone from storage. */
export async function readCompanyAsset(asset: CompanyAsset): Promise<{ bytes: Buffer; mime: string } | null> {
  const spec = COMPANY_ASSETS[asset]
  const setting = (await prisma.companySetting.findUnique({ where: { id: await requireCompanyId() } })) as AssetRow
  const stored = setting?.[spec.stored]

  if (!stored) return null

  try {
    return { bytes: await readUpload(stored), mime: setting?.[spec.mime] ?? 'image/png' }
  } catch {
    return null
  }
}
