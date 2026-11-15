import { whatsappLink } from '@/lib/whatsapp'

/**
 * The public links a quotation or order hands to a customer, built from a base
 * URL the caller passes (the web uses PUBLIC_BASE_URL or the browser origin, the
 * API the configured public URL). Pure, so every client words them the same.
 */

const trimBase = (base: string | null | undefined) => (base ?? '').replace(/\/+$/, '')

export function quotationShareUrl(baseUrl: string | null | undefined, token: string) {
  return `${trimBase(baseUrl)}/q/${token}`
}

export function orderTrackingUrl(baseUrl: string | null | undefined, token: string) {
  return `${trimBase(baseUrl)}/t/${token}`
}

export function quotationWhatsappText(input: {
  customerName: string
  quotationNumber: string
  companyName?: string | null
  url: string
}) {
  return `Hello ${input.customerName}, here is your quotation ${input.quotationNumber} from ${input.companyName || 'us'}. You can view it and approve it here:\n\n${input.url}`
}

export function trackingWhatsappText(input: {
  customerName: string
  orderNumber: string
  url: string
}) {
  return `Hello ${input.customerName}, you can follow the progress of your order ${input.orderNumber} here:\n\n${input.url}`
}

export type ShareLinkParts = {
  token: string
  url: string
  whatsappText: string
  whatsappLink: string
}

export function quotationShareParts(input: {
  baseUrl: string | null | undefined
  token: string
  customerName: string
  customerPhone: string | null
  quotationNumber: string
  companyName?: string | null
}): ShareLinkParts {
  const url = quotationShareUrl(input.baseUrl, input.token)
  const whatsappText = quotationWhatsappText({
    customerName: input.customerName,
    quotationNumber: input.quotationNumber,
    companyName: input.companyName,
    url,
  })

  return {
    token: input.token,
    url,
    whatsappText,
    whatsappLink: whatsappLink(input.customerPhone, whatsappText),
  }
}

export function trackingShareParts(input: {
  baseUrl: string | null | undefined
  token: string
  customerName: string
  customerPhone: string | null
  orderNumber: string
}): ShareLinkParts {
  const url = orderTrackingUrl(input.baseUrl, input.token)
  const whatsappText = trackingWhatsappText({
    customerName: input.customerName,
    orderNumber: input.orderNumber,
    url,
  })

  return {
    token: input.token,
    url,
    whatsappText,
    whatsappLink: whatsappLink(input.customerPhone, whatsappText),
  }
}
