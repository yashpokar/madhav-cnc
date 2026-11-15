import { ApiError } from '@/lib/api/errors'

export type Platform = 'ios' | 'android'

/** Compares dotted numeric versions ("1.10.0" > "1.9.3"). Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)

  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)

    if (diff !== 0) return diff < 0 ? -1 : 1
  }

  return 0
}

export function minAppVersions(env: Record<string, string | undefined> = process.env) {
  return {
    ios: env.PRODLYS_MIN_APP_VERSION_IOS || '0.0.0',
    android: env.PRODLYS_MIN_APP_VERSION_ANDROID || '0.0.0',
  }
}

export function latestAppVersion(env: Record<string, string | undefined> = process.env) {
  return env.PRODLYS_LATEST_APP_VERSION || '1.0.0'
}

/**
 * The app sends X-Platform and X-App-Version. When its version is below the
 * minimum for its platform it must update (426). Requests without both headers
 * (web, curl) are not gated.
 */
export function assertAppVersion(headers: Headers, env: Record<string, string | undefined> = process.env) {
  const platform = headers.get('x-platform')?.toLowerCase()
  const version = headers.get('x-app-version')

  if ((platform !== 'ios' && platform !== 'android') || !version) return

  const minimum = minAppVersions(env)[platform]

  if (compareVersions(version, minimum) < 0) {
    throw new ApiError('UPGRADE_REQUIRED', `This version of the app is no longer supported. Update to ${minimum} or later.`)
  }
}
