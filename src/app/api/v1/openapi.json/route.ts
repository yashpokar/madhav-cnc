import { apiRoute, reply } from '@/lib/api/handler'
import spec from '../../../../../openapi/prodlys-v1.json'

// The committed spec (regenerate with `pnpm openapi:generate`).
export const GET = apiRoute({ auth: 'none', versionGate: false }, async () =>
  reply(spec, { raw: true, headers: { 'Cache-Control': 'public, max-age=300' } }),
)
