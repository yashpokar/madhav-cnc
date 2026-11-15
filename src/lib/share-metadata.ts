import type { Metadata } from 'next'

/**
 * Metadata for customer-facing share pages (/q, /t, /i).
 *
 * Titles read "Company · Quotation Q-0001". Never pass amounts, customer
 * names or notes in here: link previews are copied into chats and logs.
 * These pages stay noindex and use the neutral share image, not Prodlys'.
 */
export function shareMetadata({
  kind,
  company,
  number,
}: {
  kind: string
  company?: string | null
  number?: string | null
}): Metadata {
  const label = number ? `${kind} ${number}` : kind
  const title = company ? `${company} · ${label}` : label
  const description = company
    ? `${label} shared by ${company}.`
    : `${label} shared with you.`

  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { type: 'website', title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}
