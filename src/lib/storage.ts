import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
}

export function uploadRoot() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'storage', 'uploads')
}

export function isAllowedType(mimeType: string) {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
}

export function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType] ?? ''
}

function resolveStoredPath(storedName: string) {
  const root = uploadRoot()
  const resolved = path.resolve(root, storedName)

  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('Invalid stored file name')
  }

  return resolved
}

export async function saveUpload(bytes: Buffer, mimeType: string) {
  const storedName = `${randomUUID()}${extensionFor(mimeType)}`
  const target = resolveStoredPath(storedName)

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)

  return {
    storedName,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function copyUpload(storedName: string) {
  const source = resolveStoredPath(storedName)
  const extension = path.extname(storedName)
  const target = `${randomUUID()}${extension}`

  await mkdir(path.dirname(resolveStoredPath(target)), { recursive: true })
  await copyFile(source, resolveStoredPath(target))

  return target
}

export async function readUpload(storedName: string) {
  return readFile(resolveStoredPath(storedName))
}

export async function deleteUpload(storedName: string) {
  try {
    await unlink(resolveStoredPath(storedName))
  } catch {
    return false
  }

  return true
}
