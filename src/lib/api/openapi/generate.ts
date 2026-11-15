import { mkdirSync, writeFileSync } from 'node:fs'
import { serializeOpenApiDocument } from '@/lib/api/openapi/document'

// `pnpm openapi:generate` -> openapi/prodlys-v1.json (committed; a test fails when it is stale).
mkdirSync('openapi', { recursive: true })
writeFileSync('openapi/prodlys-v1.json', serializeOpenApiDocument())
console.log('Wrote openapi/prodlys-v1.json')
