import { createHash, randomUUID } from 'node:crypto'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

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

const SAFE_STORED_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

type StorageConfig = {
  bucket: string
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

let cachedClient: S3Client | null = null
let cachedBucket: string | null = null

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(
      `Object storage is not configured: ${name} is missing. Set S3_BUCKET, S3_ENDPOINT, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.`,
    )
  }

  return value
}

function storageConfig(): StorageConfig {
  return {
    bucket: requireEnv('S3_BUCKET'),
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.AWS_REGION ?? 'auto',
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
  }
}

function storage() {
  if (cachedClient && cachedBucket) {
    return { client: cachedClient, bucket: cachedBucket }
  }

  const config = storageConfig()

  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  cachedBucket = config.bucket

  return { client: cachedClient, bucket: cachedBucket }
}

export function isStorageConfigured() {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ENDPOINT &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  )
}

export function isAllowedType(mimeType: string) {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
}

export function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType] ?? ''
}

function objectKey(storedName: string) {
  if (!SAFE_STORED_NAME.test(storedName) || storedName.includes('..')) {
    throw new Error('Invalid stored file name')
  }

  return storedName
}

function extensionOf(storedName: string) {
  const dot = storedName.lastIndexOf('.')

  return dot > 0 ? storedName.slice(dot) : ''
}

export async function saveUpload(bytes: Buffer, mimeType: string) {
  const storedName = `${randomUUID()}${extensionFor(mimeType)}`
  const { client, bucket } = storage()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey(storedName),
      Body: bytes,
      ContentType: mimeType,
      ContentLength: bytes.byteLength,
    }),
  )

  return {
    storedName,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function copyUpload(storedName: string) {
  const source = objectKey(storedName)
  const target = `${randomUUID()}${extensionOf(storedName)}`
  const { client, bucket } = storage()

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: objectKey(target),
      CopySource: `${bucket}/${encodeURIComponent(source)}`,
    }),
  )

  return target
}

export async function readUpload(storedName: string) {
  const { client, bucket } = storage()

  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey(storedName) }),
  )

  if (!result.Body) {
    throw new Error('Stored file has no content')
  }

  return Buffer.from(await result.Body.transformToByteArray())
}

export async function deleteUpload(storedName: string) {
  try {
    const { client, bucket } = storage()

    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(storedName) }),
    )
  } catch {
    return false
  }

  return true
}
