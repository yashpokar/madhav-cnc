import { apiRoute } from '@/lib/api/handler'
import { releaseInfo } from '@/lib/release'
import { latestAppVersion, minAppVersions } from '@/lib/api/app-version'

// Public. An app calls this first to learn whether it must update. It is not
// version-gated, so an outdated app can still read it.
export const GET = apiRoute({ auth: 'none', versionGate: false }, async () => ({
  apiVersion: '1' as const,
  minAppVersion: minAppVersions(),
  latestAppVersion: latestAppVersion(),
  maintenance: false,
  release: releaseInfo(),
}))
