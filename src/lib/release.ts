import pkg from '../../package.json'

/**
 * What is deployed. Version comes from package.json (bumped by release-please),
 * the commit from Railway at runtime, and builtAt is stamped by next.config.ts.
 * The literal `process.env.X` reads are deliberate: Next inlines build-time
 * `env` values only for static property access.
 */
export function releaseInfo() {
  return {
    version: pkg.version,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev',
    builtAt: process.env.PRODLYS_BUILT_AT || null,
  }
}
