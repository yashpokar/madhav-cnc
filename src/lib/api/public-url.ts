/**
 * The public origin links for customers are built on (PUBLIC_BASE_URL, as on
 * the web). Null gives path-only urls, which is what the web does without it.
 */
export function baseUrl(): string | null {
  return process.env.PUBLIC_BASE_URL?.trim() || null
}
